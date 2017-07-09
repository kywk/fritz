var Protobuf = require("../lib/protobuf.js");
var Protocol = require("../lib/protocol.js");

var Message = function(parent) {
  this.TYPE_REQUEST = 0;
  this.TYPE_NOTIFY = 1;
  this.TYPE_RESPONSE = 2;
  this.TYPE_PUSH = 3;
};

Message.prototype.encode = function(id, route, msg) {
  var type = id ? this.TYPE_REQUEST : this.TYPE_NOTIFY;
  var msgStr = JSON.stringify(msg);
  var byte = Protobuf.encode(route, msg) || Protocol.strencode(msgStr);
  var buffer = Protocol.Message.encode(id, type, null, route, byte);
  return buffer;
};

Message.prototype.decode = function(buffer) {
  var msg = Protocol.Message.decode(buffer);
  msg.body = Protobuf.decode(msg.route, buffer) || JSON.parse(Protocol.strdecode(msg.body));
  return msg;
};

module.exports = Message;
