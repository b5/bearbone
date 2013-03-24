var should = require('should')
	, Controller = require('../lib/Controller')
	, Model = require('../lib/Model')
	, db = require('ninjazord');

// Controller Unit Test
// --------------------
// Controllers organize a designated model into sets. They rely on the Model
// for all CRUD methods, and listen for these changes via events.

describe('Controller',function () {
	var TestModel = Model.extend({
				name : 'testModels',
				attributes : {
					title : ['string',true, false, 'default title'],
					body : ['string',false,false,'default body'],
					hidden : ['boolean']
				}
			})
		, testModel = new TestModel()
		, testModelId
		,	TestController = Controller.extend({
				model: testModel,
				sets : {
					hidden: ['hidden', true],
					visible: ['hidden', false]
				},
				indexes : ['title']
			})
		, testController = new TestController();

	before(function(){
		db.setPrefix('tests.');
	});

	it('should be an object with a bunch of methods', function(){
		testController.should.be.a('object');
	});
	it('should inherit from EventEmitter', function(){
		testController.on.should.be.a('function');
		testController.emit.should.be.a('function');
	});
	it('should have an extend method', function(){
		TestController.extend.should.be.a('function');
	});
	it('should require a model', function(){
		try { new Controller() }
		catch (err) { err.should.exist };
	});

	describe('model listener methods', function(){
		it('should have a created method',function(){
			testController.created.should.be.a('function');
		});
		it('should have a updated method',function(){
			testController.updated.should.be.a('function');
		});
		it('should have a deleted method',function(){
			testController.deleted.should.be.a('function');
		});
	});

	describe('Events', function(){
		var testId;
		it('should emit model:created after updating sets', function(done){
			testController.once('model:created',function(object){
				object.should.be.a('object');
				testId = object.id;
				done();
			});
			testModel.create({ title: 'events created test', body : 'cool' });
		});
		it('should emit model:deleted after removing a deleted model from sets', function(done){
			testController.once('model:deleted',function(object){
				object.should.be.a('object');
				testId = object.id;
				done();
			});
			testModel.del(testId);
		});
	});
	
	describe('Sets', function (){
		// Sets keep a recored ordered according to the 0th value listed
		// in the array. it can be any value.
		it('should require a sets object with array values', function(){
			try { new Controller({model : testModel}); }
			catch (err) { err.should.exist }
		});
		it('get method should return an array of read model objects',function(done){
			testController.get.should.be.a('function');
			testController.get('all', function(set){
				set.should.be.a('object');
				set.length.should.be.a('number');
				done();
			});
		});
		it('get method should return false if the set doesn\'t exist', function(done){
			testController.get('adfghjk',function(set){
				set.should.equal(false);
				done();
			});
		});
		it('should call add on all sets on model created event', function(done){
			testController.once('model:created',function(){
				testController.get('all',function(all){
					all.should.be.a('object');
					done();
				});
			});
			testModel.create({hidden: false, body: 'new object'}, function(object){
				testModelId = object.id;
			});
		});
		it('should call remove on all sets on model created event', function(done){
			testController.once('model:deleted',function(){
				testController.get('all',function(all){
					all.should.be.a('object');
					done();
				});
			});
			testModel.del(testModelId);
		});
	});
	describe('Indexes', function(){
		before(function(done){
			testModel.create({ title : 'kickass', body : 'no body!'}, function(newObject){
				done();
			});
		});

		it('should have a find method', function(done){
			testController.find('kickass',function(object){
				object.length.should.equal(1);
				object[0].should.be.a('object');
				done();
			});
		});
	});

});