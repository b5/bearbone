var util = require('util');

var AbstractError = function (msg, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Error';
};

util.inherits(AbstractError, Error);
AbstractError.prototype.name = 'Abstract Error';


var ModelError = function (msg) {
  ModelError.super_.call(this, msg, this.constructor);
};

util.inherits(ModelError, AbstractError);
ModelError.prototype.message = 'Model Error';


var ControllerError = function (msg) {
  ControllerError.super_.call(this, msg, this.constructor);
};

util.inherits(ControllerError, AbstractError);
ControllerError.prototype.message = 'Controller Error';

module.exports = {
	Model : ModelError,
	Controller : ControllerError
};