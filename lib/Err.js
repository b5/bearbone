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
ModelError.prototype.message = 'error in bearbone model';
ModelError.prototype.name = 'Model Error';


var ControllerError = function (msg) {
  ControllerError.super_.call(this, msg, this.constructor);
};

util.inherits(ControllerError, AbstractError);
ControllerError.prototype.name = 'Controller Error';
ControllerError.prototype.message = 'error in bearbone controller';

module.exports = {
	Model : ModelError,
	Controller : ControllerError
};