var util =      require('util');
var net =       require('net');
var tls =       require('tls');
var fs =        require('fs');
var events =    require('events');
var bytearray = require('bytearray');
var debuglog =  require('debug-log')('pomelo-cli');

var Message =   require('./message.js');
var Package =   require('./package.js');
var Transport = require('./transport.js');
var Request =   require('./request.js');
var Protocol =  require('./protocol.js');
var Protobuf =  require('./protobuf.js');

var PackageConstants = {
  TYPE_HANDSHAKE: 1,
  TYPE_HANDSHAKE_ACK: 2,
  TYPE_HEARTBEAT: 3,
  TYPE_DATA: 4,
  TYPE_KICK: 5
};

var Pomelo = function() {
  var self = this;

  self.requests = {};
  self.info = {
    sys: {
      version: '1.2.0',
      type: 'pomelo-node-tcp-client',
      pomelo_version: '1.2.0'
    }
  };
  self._handshake = null;
  self._initError = null;
  self._socket = null;
  self._hb = 0;
  self._package = new Package();
  self._message = new Message(self);
  self._pkg = null;
  self._routesAndCallbacks = [];
  self._pomelo = null;
  self.heartbeat = 0;
  self.consoleLogs = false;
  self.finalData;
  self.connected = false;
  self.isTLS = false;
};

util.inherits(Pomelo, events.EventEmitter);

Pomelo.prototype.init = function(host, port, user, opt, callback) {
  var self = this;
  self.info.user = user;
  self._handshake = callback;

  if (opt) {
    self.isTLS = true;
    self._socket = new tls.TLSSocket();
  }
  else {
    self.isTLS = false;
    self._socket = new net.Socket();
  }

  self._socket.setNoDelay();
  self._socket.on('connect', self.onConnect.bind(self));
  self._socket.on('close', self._onClose.bind(self));
  self._socket.on('error', self._onError.bind(self));
  self._transport = new Transport();
  self._transport.on('end', self.onPkg.bind(self));
  self._socket.on('data', self._transport.onData.bind(self._transport));
  self.connected = false;

  if (opt) {
    self._socket.connect(port, host, opt, function (err, data) {
      self.connected = true;
      debuglog('connected!');
    });
  }
  else {
    self._socket.connect(port, host, function () {
      self.connected = true;
      debuglog('connected!');
    });
  }
};

Pomelo.prototype.disconnect = function() {

  var self = this;
  self.connected = false;
  if (self.isTLS && self._socket) {
    debuglog('disconnect');
    self._socket.destroy();
  }
  else if (!self.isTLS && self._socket && self._socket.connected) {
    debuglog('disconnect');
    self._socket.close();
  }
  if (self._hb) {
    clearTimeout(self._hb);
  }
};

Pomelo.prototype.request = function(route, msg, callback) {
  var self = this;

  if (!route || !route.length) {
    return;
  }

  if (callback === null) {
    self.notify(route, msg);
    return;
  }

  var req = new Request(route, callback);
  self.requests[req.id] = req;

  self.send(req.id, req.route, msg || {});
};

Pomelo.prototype.notify = function(route, msg) {
  var self = this;

  self.send(0, route, msg || {});
};

Pomelo.prototype.on = function(route, callback) {
  var self = this;
  self._routesAndCallbacks[route] = callback;
};

Pomelo.prototype.beat = function() {
  var self = this;

  clearTimeout(self._hb);
  self._hb = 0;

  self.socketSend(self._package.encode(PackageConstants.TYPE_HEARTBEAT));
};

Pomelo.prototype.send = function(reqId, route, msg) {
  var self = this;
  var msgStr = JSON.stringify(msg);
  var buffer = new Buffer(msgStr.length);

  buffer = self._message.encode(reqId, route, msg);
  buffer = self._package.encode(PackageConstants.TYPE_DATA, buffer);

  self.socketSend(buffer);
};

Pomelo.prototype.onConnect = function() {
  var self = this;
  self.socketSend(self._package.encode(
    PackageConstants.TYPE_HANDSHAKE,
    Protocol.strencode(JSON.stringify(self.info))
  ));
};

Pomelo.prototype.socketSend = function(data) {
  var self = this;
  self._socket.write(data);
};

Pomelo.prototype._onClose = function() {
  debuglog('closed');
  this.connected = false;
  if (this.onClose) {
    this.onClose();
  }
};

Pomelo.prototype._onError = function(err) {
  debuglog('onError :',err);
  if (this.onError) {
    this.onError(err);
  }
  if (this._handshake) {
    this._handshake.bind(this)(err, null);
    this._handshake = null;
  }
};

Pomelo.prototype.onPkg = function(package) {
  var self = this;
  self._pkg = package;
  switch (self._pkg.type) {
    case self._package.TYPE_HANDSHAKE:
      var message = self._pkg.body.toString();
      var response = JSON.parse(message);
      if (response.code == 200) {
        if (response.sys) {
          debuglog('sys : %j', response.sys);
          Protobuf.init(response.sys.protos);
          self.heartbeat = response.sys.heartbeat;
        }
        self.socketSend(self._package.encode(self._package.TYPE_HANDSHAKE_ACK));
        self.emit('handshake');
      }
      if (self._handshake !== null) {
        self._handshake.bind(self)(null, response);
        self._handshake = null;
      }
      self._pkg = null;
      break;
    case self._package.TYPE_HANDSHAKE_ACK:
      self._pkg = null;
      break;
    case self._package.TYPE_HEARTBEAT:
      self._pkg = null;
      if (self.heartbeat) {
        self._hb = setTimeout(self.beat.bind(self), self.heartbeat*1000);
      }
      break;
    case self._package.TYPE_DATA:
      var msg = self._message.decode(self._pkg.body);
      // debuglog('onPkg [%s][%s] route: %s body: %j', (msg.id?'REQ':'PUS'), msg.id, msg.route, self.body.length);

      if (!msg.id) {
        // server push
        if (self._routesAndCallbacks[msg.route]) {
          self._routesAndCallbacks[msg.route](msg.body);
        }
      }
      else {
        // response
        self.requests[msg.id].callback.call(self, msg.body);
        self.requests[msg.id] = null;
      }
      self._pkg = null;
      break;
    case self._package.TYPE_KICK:
      _pkg = null;
      break;
  }
};

Pomelo.prototype.getMessage = function() {
  var self = this;
  return self._message;
};

Pomelo.prototype.setMessage = function(msg) {
  var self = this;
  self_message = msg;
};

module.exports = Pomelo;

