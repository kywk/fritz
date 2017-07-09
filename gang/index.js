
var errCode = 404;

var pomeloClient = function (auth) {
  this.pool = require('./pomeloClientPool').create(auth);
};

pomeloClient.prototype.request = function (route, msg, callback) {
  var self = this;
  self.pool.acquire(function (err, client) {
    if (!!err) {
      console.error('[Pomelo Client Error] ' + err.stack);
      self.pool.release(client);
      return callback.apply(null, [errCode, err.stack]);
    }
    else {
      client.request(route, msg, function (data) {
        self.pool.release(client);
        callback.apply(null, [null, data]);
      });
    }
  });
};

module.exports.init = function(auth) {
  return new pomeloClient(auth);
};
