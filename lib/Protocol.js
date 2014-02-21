var db = require('ninjazord')
	, Err = require('./Err')
	, utils = require('./Utils')
	, _ = require('underscore')
	, EventEmitter = require('events').EventEmitter;

/*
	Protocols define a "contract" that an object must conform to.
	They're for standardizing architectural patterns into general places
	that can work across objects (Models, Controllers)
*/

var Protocol = function (Target) {
	var self = this
		, name = this.name;

	if (!self.name) { throw new Err.Protocol('name required for protocol'); }
	if (!Target instanceof EventEmitter) { throw new Err.Protocol('Protocol targets must be event emitters'); }

	// Protocols are event emitters?
	EventEmitter.call(this);

	// add the listed methods to the targetObject
	_.extend(Target, this.methods);

	for (var event in self.events) {
		var method = self.events[event];
		if ( !_.isFunction(Target[method]) ) { throw new Err.Protocol(Target.name + " " + method + " must be a function"); }
		this.on(event, _.bind(Target[method], Target));
	}

	if (!self.conforms(Target)) { throw new Err.Protocol("Target Object Does Not conform to protocol"); }
	self.initialize.call(self, Target);

	return this;
}

utils.extend( Protocol.prototype, {
  // Inherit from EventEmitter
  __proto__ : EventEmitter.prototype,
  // Export error for easy error creation
  Error : Err.Protocol,
	// Give all subsequent protocols access to database tools
	db : db,
	// All Protocols must define a name.
	name : undefined,
	// black init function. override to your delight.
	initialize : function (Target) { },
	// an object of methods that will be bound to the host object
	methods : {},
	// an object of { attributeName : 'type' }
	// that must be present to conform to the protocol
	attributes : {},
	// an object of { eventName : "methodName" } that 
	// this protocol will subscribe to.
	// method names will be added to methods array
	events : {},
	// check if a given object conforms to this protocol
	conforms : function (object) {

		for (var method in this.methods) {
			if (!_.isFunction(object[method])) { return false; }
		}

		for (var attribute in this.attributes) {
			if (!object.attributes[attribute]) { return false; }
			// @todo - check the type of the attribute
		}

		return true;
	}
});

// Protocol Extend Method.
Protocol.extend = utils.classExtend;

module.exports = Protocol;