// ** Abstract Class Does not export a constructed object**
// @todo - should convert "parentId" to be whatever attribute
// name you'd like to use.
// should have a "parentIdAttribute" that can be set to any attr name,
// and will be made to be required. 
var Model = require('./Model')
	, EventEmitter = require('events').EventEmitter;

var ChildModel = Model.extend({
	constructor : function (options) {
		var self = this
			, name = this.name;

		if (!self.name) throw 'name required for model'; 
		EventEmitter.call(this);

		this.storedAttributes.id || (this.storedAttributes.id = ['number'])
		this.storedAttributes.created || (this.storedAttributes.created = ['number', false, true])
		this.storedAttributes.updated || (this.storedAttributes.updated = ['number', false, true])
		this.storedAttributes.parentModel || (this.storedAttributes.parentModel = ['string', true, true])
		this.storedAttributes.parentId || (this.storedAttributes.parentId = ['number', true, true])

		if(self.externalId) {
			self.create = self._externalCreate;
			// make the id attribute required for creation
			this.storedAttributes.id[1] || (this.storedAttributes.id = ['number', true])
		}
		
		self.setRequiredAttributes.call(self);
		self.initialize.apply(self, options);
	},
	storedAttributes: {
		created: ['number'],
		updated: ['number'],
		parentModel: ['string', true, true],
		parentId: ['number', true, true],
	},
	// set externalId to true if an id needs to be provided for create
	externalId : false,
	parentModel: undefined,
	// @todo - This should filter 'parentModel' to make
	// sure the child can be added.
	acceptedParents : [],
	nameSpace : function (parentModel, parentId) {
		return parentModel + '.' + parentId + '.' + this.name;
	},
	exists : function (parentModel, parentId, id, callback) {
		var self = this;
		self.db.objectExists(self.nameSpace(parentModel, parentId), id, callback);
	},
	parentExists : function (parentModel, parentId, callback) {
		this.db.objectExists(parentModel, parentId, callback);
	},
	initialize: function () {
		
		Model.prototype.initialize.call(this);
	},
	validate : function (attrs, options) {
		var self = this, valid = true;
		options || (options = {})

		if (!attrs || typeof attrs != 'object') return false;

		for (var attr in attrs) {
			if (!attrs[attr]) delete attrs[attr];
			else if (!self.storedAttributes[attr]) delete attrs[attr];
			else if (typeof attrs[attr] != self.storedAttributes[attr][0]) delete attrs[attr];
		}

		// Add default if no value is supplied.
		for (var attr in self.storedAttributes) { 
			if ( (self.storedAttributes[attr][3] || self.storedAttributes[attr][3] === 0) && !attrs[attr])
				attrs[attr] = self.storedAttributes[attr][3]; 
		}
		
		if (!options.update) {
			// check required attrs
			self.requiredAttributes.forEach(function(attr){ 
				if (!attrs[attr] && attrs[attr] != 0) { 
					valid = false; 
					if (self.verbose) console.log('%s attr missing',attr); 
				}
			});
		} 
		else if (!attrs.parentModel || !attrs.parentId || !attrs.id) valid = false;

		return valid;
	},
	create : function (attrs, callback) {
		var self = this;

		if (!self.validate(attrs)) return self.cb(false, callback);
		
		self.parentExists(attrs.parentModel, attrs.parentId, function(exists){
			if (exists)
				self.db.createObject( self.nameSpace(attrs.parentModel, attrs.parentId), attrs, function(object){
					self.emit('created', self.private(object));
					self.cb(self.public(object),callback);
				});
			else { 
				if (self.verbose) console.log('cannot create child model %s, parent %s.%s doesn\'t exist.',self.name, attrs.parentModel, attrs.parentId);
				self.cb(false, callback); 
			}
		});
		return true;
	},
	_externalCreate : function (attrs, callback) {
		var self = this;
		
		if (!self.validate(attrs)) return self.cb(false, callback);
		
		self.parentExists(attrs.parentModel, attrs.parentId, function(exists){
			if (exists)
				self.db.createObjectWithExternalId( self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, attrs, function(object){
					self.emit('created', self.private(object));
					self.cb(self.public(object),callback);
				});
			else { 
				if (self.verbose) console.log('cannot create %s, parent doesn\'t exist.',self.name);
				self.cb(false, callback); 
			}
		});
		return true;
	},
	_read : function (parentModel, parentId, id, options, callback) {
		var self = this;
		self.db.objectExists(self.nameSpace(parentModel, parentId), id, function(exists){
			if (exists) {
				self.db.readObject( self.nameSpace(parentModel, parentId), id, function(childObject){
					if (childObject)
						// convert read out redis numbers to js numbers
						for (var attr in childObject) {
							if (self.storedAttributes[attr][0] === 'number') childObject[attr] = parseFloat(childObject[attr]);
						}
					callback(childObject);
				});
			} else callback(false);
		});
	},
	read : function (attrs, options, callback) {
		var self = this, method;
		
		if (typeof options === 'function') callback = options;
		options || (options = {})
		// unless private : true is specified, we read with 
		// the public method
		method = (options.private) ? 'private' : 'public';

		// accept an array of ids
		if (typeof attrs.id === 'object' && attrs.id.length) {
			var objects = [], count = attrs.id.length;
			attrs.id.forEach(function(id){
				self._read(attrs.parentModel, attrs.parentId, id, options, function(object){
					objects.push(self[method](object));
					if (--count == 0) self.cb(objects, callback);
				});
			});
		} 
		// or just a single id.
		else self._read(attrs.parentModel, attrs.parentId, attrs.id, options, function(object){  object ? self.cb( self[method](object), callback) : self.cb(false, callback); });
	},
	update : function (attrs, callback) {
		var self = this;

		if (!self.validate(attrs, {update: true})) return self.cb(false, callback);
		
		self.exists(attrs.parentModel, attrs.parentId, attrs.id, function(exists){
			if (exists) {
				if (self.size(attrs) > 0) {
					self.db.updateObject( self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, attrs, function(updatedObject){
						self._read(attrs.parentModel, attrs.parentId, attrs.id, {}, function(object){
							self.emit('updated', self.private(object));
							self.cb(self.public(object), callback);
						});
					});
				} else { 
					// @todo - for now if there's nothing to update it
					// just reads & returns it. bad idea? I think so.
					if (typeof callback === 'function')
						self.read(parentModel, parentId, id, callback);
				}
			} else self.cb(false, callback);
		});
		return true;
	},
	del : function (attrs, callback) {
		var self = this;
		self.db.deleteObject(self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, function(response){
			self.emit('deleted', attrs);
			self.cb(response, callback);
		});
	}

});

module.exports = ChildModel;