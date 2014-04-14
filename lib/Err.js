var util = require('util');

var AbstractError = function (msg, statusCode, constr) {
	Error.captureStackTrace(this, constr || this);
	this.message = msg || "Error";
	this.statusCode = statusCode || 500;
};

util.inherits(AbstractError, Error);
AbstractError.prototype.name = 'Abstract Error';
AbstractError.prototype.message = 'General Error';
AbstractError.prototype.statusCode = 500;

var ModelError = function ModelError (msg, statusCode) {
  ModelError.super_.call(this, msg, statusCode, this.constructor);
};

util.inherits(ModelError, AbstractError);
ModelError.prototype.message = 'error in bearbone model';
ModelError.prototype.name = 'Model Error';


var ControllerError = function (msg, statusCode) {
  ControllerError.super_.call(this, msg, statusCode, this.constructor);
};

util.inherits(ControllerError, AbstractError);
ControllerError.prototype.name = 'Controller Error';
ControllerError.prototype.message = 'error in bearbone controller';

var ConfigError = function (msg, statusCode) {
	ControllerError.super__.call(this, msg, statusCode, this.constructor);
};

util.inherits(ConfigError, AbstractError);
ConfigError.prototype.name = 'Configuration Error';
ConfigError.prototype.message = 'error in bearbone configuration';

var ProtocolError = function (msg,statusCode) {
	ProtocolError.super_.call(this,msg,statusCode,this.constructor);
}
util.inherits(ProtocolError, AbstractError);
ProtocolError.prototype.name = "Protocol Error";
ProtocolError.prototype.message = "error in protocol";

module.exports = {
	Model : ModelError,
	Controller : ControllerError,
	ConfigError : ConfigError,
	Protocol : ProtocolError
};