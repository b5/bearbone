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
					hidden : ['boolean', true, false, false]
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
				indexes : ['title'],
				completions : {
					title : 99,
					body : 50
				},
				trackedAttributes : ['title']
			})
		, testController = new TestController();

	before(function(done){
		// testModel.verbose = true;
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			done();
		});
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
	
	describe('CRUD', function (){
		var model;

		it('create', function (done){
			testController.create.should.be.a('function');
			testController.create({ title : "test", body : "body", hidden : false }, function (err, _model){
				should.not.exist(err);
				model = _model;
				done();
			});
		});
		it('read', function (done){
			testController.read.should.be.a('function');
			testController.read([model.id, 12], function(err, _models){
				should.not.exist(err);
				should(_models instanceof Array);
				model = _models[0];
				done();
			});
		});
		it('should have a read recent method', function(done){
			testController.readRecent(25,function(err, recent){
				should.not.exist(err);
				recent.should.be.a('object');
				done();
			});
		});
		it('update', function (done){
			testController.update.should.be.a('function');
			testController.update(model, function (err, _model){
				should.not.exist(err);
				done();
			});

		});
		it('del', function (done){
			testController.del.should.be.a('function');
			testController.del(model.id, function (err, _model){
				should.not.exist(err);
				done();
			});
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
		it('should emit model:updated after updating the model from the sets', function(done){
			testController.once('model:updated', function(object){
				object.should.be.a('object');
				done();
			});
			testModel.update({ id: testId, title : 'updated stuff'});
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
		before(function(done){
			testModel.create({ hidden : true },function(err,obj){
				should.not.exist(err);
				done();
			})
		});

		it('should require a sets object with array values', function(){
			try { new Controller({model : testModel}); }
			catch (err) { should.exist(err); }
		});
		it('get method should return an array of read model objects',function(done){
			testController.get.should.be.a('function');
			testController.get('all', function(err, set){
				set.should.be.a('object');
				set.length.should.be.a('number');
				done();
			});
		});
		it('get method should return false if the set doesn\'t exist', function(done){
			testController.get('adfghjk',function(err, set){
				set.should.equal(false);
				done();
			});
		});
		it('should call add on all sets on model created event', function(done){
			testController.once('model:created',function(){
				testController.get('all',function(err, all){
					all.should.be.a('object');
					done();
				});
			});
			testModel.create({ body: 'new object'}, function(err, object){
				testModelId = object.id;
			});
		});
		it('should update & trigger model:updated on updated event',function(done){
			testController.get('visible',function(visibleModels){
				// visibleModels.length.should.equal(1);
				// visibleModels[0].id.should.equal(testModelId);

				testController.get('hidden', function(err, hiddenModels){
					hiddenModels.length.should.equal(1);

					testController.once('model:updated', function(err, object){
						testController.get('visible',function(err, visibleModels){
							visibleModels.length.should.equal(0);
							testController.get('hidden', function(err, hiddenModels){
								hiddenModels.length.should.equal(2);
								hiddenModels[hiddenModels.length - 1].id.should.equal(testModelId);
								done();
							});
						});
					});

					testModel.update({ id: testModelId, hidden : true});
				});
			});
		});
		it('should call remove on all sets on model deleted event', function(done){
			testController.once('model:deleted',function(){
				testController.get('all',function(err, all){
					all.should.be.a('object');
					done();
				});
			});
			testModel.del(testModelId);
		});
	});
});