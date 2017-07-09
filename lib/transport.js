var util = require('util');
var events = require('events');
var bytearray = require('bytearray');
var debuglog = require('debug-log')('pomelo-cli');
var HEAD_LEN = 4;

var Transport = function() {};
util.inherits(Transport, events.EventEmitter);

// event from socket (pomelo.js), data is buffer format
Transport.prototype.onData = function(data) {
  var self = this;
  debuglog('[data] size: %s, buffer: %s',data.length, (self.buffer?self.buffer.length:0));
  if (self.buffer && data) {
    // append last buffer
    data = Buffer.concat([self.buffer, data]);
  }
  self.processData(data);
};

Transport.prototype.processData = function(data) {
  var self = this;
  var body;

  if (data.length < HEAD_LEN) {
    // data not complete, wait next packet
    self.buffer = data;
    return;
  }

  // parse head = type + body length
  var type = bytearray.readUnsignedByte(data,0);
  var bodyLen = (bytearray.readUnsignedByte(data) << 16 | bytearray.readUnsignedByte(data) << 8 | bytearray.readUnsignedByte(data)) >>> 0;

  var available = bytearray.getBytesAvailable(data);
  if (available < bodyLen) {
    // data not complete, wait next packet
    self.buffer = data;
    return;
  }

  pkgLen = bodyLen + HEAD_LEN;
  // parse body
  body = new Buffer(bodyLen);
  for (var i=HEAD_LEN; i<pkgLen; i++) {
    bytearray.writeUnsignedByte(body, data[i]);
  }

  // update buffer
  var overLen = data.length - pkgLen;
  if (overLen>0) {
    self.buffer = data.slice(pkgLen, data.length);
  }
  else {
    self.buffer = null;
  }

  var package = {'type': type, 'body': body, 'length': bodyLen};
  debuglog('[end] pkg: %j, type: %s, buffer: %s', pkgLen, package.type, (self.buffer?self.buffer.length:0));
  self.emit('end', package);

  if (self.buffer) {
    // remaining buffer maybe still are complete package
    self.processData(self.buffer);
  }
};

module.exports = Transport;
