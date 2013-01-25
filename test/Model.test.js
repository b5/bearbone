var should = require('should')
  , Model = require('../lib/Model')
  , db = require('ninjazord');

describe('Model', function(){
	var TestModel = Model.extend({
				name : "test",
				storedAttributes: {
					body : ['string', true],
					defaultAttr : ['string', true, false, 'Store Me.']
				}
			})
	  , model = new TestModel
	  , body = 'test body'
	  , createdModelId = undefined;

	before(function(){
		//db.setPrefix('test.');
	});

	it('should be an object that inherits from EventEmitter', function(done){
		model.should.be.a('object');
		model.on.should.be.a('function');
		model.emit.should.be.a('function');
		model.on('test',function(isTrue){
			isTrue.should.equal(true);
			done();
		});
		model.emit('test', true);
	});
	it('should have an extend method',function(){
		Model.extend.should.be.a('function');
	});
	it('should have a storedAttributes entity', function(){
		model.storedAttributes.should.be.a('object');
	});
	it('should have a validate method', function(){
		model.validate.should.be.a('function');
	});
	describe('CRUD methods', function(){
		it('should reject a call to create an object without all required properties', function(done){
			model.create({},function(newObject){
				newObject.should.equal(false);
				done();
			});
		});
		it('should create an object with proper options provided', function(done){
			model.create.should.be.a('function');
			model.create({ body : body, dontCreateMe : 'do not create me'}, function(newObject){
				newObject.should.be.a('object');
				newObject.defaultAttr.should.equal('Store Me.');
				should.not.exist(newObject.dontCreateMe);
				newObject.body.should.equal(body);
				newObject.id.should.be.a('number');
				createdModelId = newObject.id;
				done();
			});
		});
		it('should emit a created event on creation & pass along the object', function(done){
			model.once('created', function(object){
				object.should.be.a('object');
				object.body.should.equal(body);
				done();
			});
			model.create({ body : body });
		});
		it('should have a read method', function(done){
			model.read.should.be.a('function');
			model.read(createdModelId, function(object){
				object.should.be.a('object');
				object.body.should.equal = body;
				done();
			});
		});
		it('should have an update method', function(done){
			body = 'updated test body';
			model.update.should.be.a('function');
			model.update(createdModelId, { body : body }, function(newObject){
				newObject.body.should.equal(body);
				done();
			});
		});
		it('should emit a updated event on creation & pass along the object', function(done){
			body = 'updated test body two!';
			model.once('updated', function(object){
				object.should.be.a('object');
				object.body.should.equal(body);
				done();
			});
			model.update(createdModelId, { body : body });
		});
		it('should have a delete method', function(done){
			model.del.should.be.a('function');
			model.once('deleted', function(object){
				object.should.be.a('object');
				done();
			});
			model.del(createdModelId);
		});
		it('read should no longer respond', function (done){
			model.read(createdModelId,function(object){
				object.should.equal(false);
				done();
			});
		});
	});

	describe('Public & Private object formatting', function(){
		before(function(done){
			model.create({ body : body, dontCreateMe : 'do not create me'}, function(newObject){
				createdModelId = newObject.id;
				done();
			});
		});

		it('should have a public method that gets called on read', function(done){
			model.public.should.be.a('function');
			model.public = function(object) {
				object.publicWasCalled = true;
				return object;
			};
			model.read(createdModelId, function(object){
				object.publicWasCalled.should.be.true;
				done();
			});
		});
		it('should have a private method that gets called on all emitted events', function(done){
			model.private.should.be.a('function');

			var count = 3;
			function complete () { if (--count === 0) done(); }

			model.private = function(object) {
				object.privateWasCalled = true;
				return object;
			};

			model.once('created', function(object){
				object.privateWasCalled.should.be.true;
				complete();
			});

			model.once('updated', function(object){
				object.privateWasCalled.should.be.true;
				complete();
			});

			model.once('deleted', function(object){
				object.privateWasCalled.should.be.true;
				complete();
			});

			model.create({ body : body, dontCreateMe : 'do not create me'}, function(object){
				object.body = 'updated body';
				model.update(object.id, object, function(){
					model.del(object.id);
				});
			});
		});
	});
	// @todo - Auto Child Created/Updated/Deleted Listeners
	describe.skip('Children Listeners', function(){
		it('should listen for children being added', function(){
			
		});
	}); 
});