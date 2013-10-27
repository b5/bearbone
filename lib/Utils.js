// Shared empty constructor function to aid in prototype-chain creation.
var ctor = function(){}
	, slice = Array.prototype.slice
	, bind  = Function.prototype.bind
	, EventEmitter = require('events').EventEmitter;

var utils = {
	// Convenience EventEmitter Accessor
	EventEmitter : EventEmitter,
	// Proper Type checking
	typeOf : function (value) {
		var s = typeof value;
		if (s === 'object') {
			if (value) {
				if (value instanceof Array) {
					s = 'array';
				}
			} else {
				s = 'null';
			}
		}
		return s;
	},
	// 'length' of an object
	size : function (obj) {
		var size = 0, key;
		for (key in obj)
			if (obj.hasOwnProperty(key)) size++;
		return size;
	},
	// The amazing Underscore Extend Method.
	extend: function (obj) {
		slice.call(arguments, 1).forEach(function(source) {
			for (var prop in source) { obj[prop] = source[prop]; }
		});
		return obj;
	},
	// Helper function to correctly set up the prototype chain, for subclasses.
	// Similar to `goog.inherits`, but uses a hash of prototype properties and
	// class properties to be extended.
	inherits : function(parent, protoProps, staticProps) {
		var child;

		// The constructor function for the new subclass is either defined by you
		// (the "constructor" property in your `extend` definition), or defaulted
		// by us to simply call the parent's constructor.
		if (protoProps && protoProps.hasOwnProperty('constructor')) {
			child = protoProps.constructor;
		} else {
			child = function(){ parent.apply(this, arguments); };
		}

		// Inherit class (static) properties from parent.
		utils.extend(child, parent);

		// Set the prototype chain to inherit from `parent`, without calling
		// `parent`'s constructor function.
		ctor.prototype = parent.prototype;
		child.prototype = new ctor();

		// Add prototype properties (instance properties) to the subclass,
		// if supplied.
		if (protoProps) utils.extend(child.prototype, protoProps);

		// Add static properties to the constructor function, if supplied.
		if (staticProps) utils.extend(child, staticProps);

		// Correctly set child's `prototype.constructor`.
		child.prototype.constructor = child;

		// Set a convenience property in case the parent's prototype is needed later.
		child.__super__ = parent.prototype;

		return child;
	},
	classExtend : function (protoProps, classProps) {
		var child = utils.inherits(this, protoProps, classProps);
		child.extend = this.extend;
		return child;
	},
	todayDate : function (date) {
		date || (date = new Date());
		date.setHours(0);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		return date;
	},
	// bind some shit to some other shit.
	bind : function (fn, context) { return Function.prototype.bind.apply(fn, Array.prototype.slice.call(arguments, 1)); },
	// callback with params only if the callback exists / is a function
	cb : function (err, res, callback) { return (typeof callback === 'function') ? callback(err, res) : false; }
};

module.exports = utils;
