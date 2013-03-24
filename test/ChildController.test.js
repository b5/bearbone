var should = require('should')
	, db = require('ninjazord')
	, Model = require('../lib/Model')
	, ChildModel = require('../lib/ChildModel')
	, Controller = require('../lib/Controller')
	, ChildController = require('../lib/ChildController');

describe('ChildController Test', function(){
	var childController, childModel, childModelId, ParentModel, parentModel, parentController;

	before(function (done){
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			setup(function(ParentMod, childMod, parentCon, childCon){
				ParentModel = ParentMod;
				childController = childCon;
				parentController = parentCon;
				childModel = childMod;
				ParentModel.create({ one : 'test!', two : 17}, function(newModel){
					parentModel = newModel;
					done();
				});
			});
		});
	});

	it('should be an object with a bunch of methods', function(){
		childController.should.be.a('object');
	});
	it('should inherit from EventEmitter', function(){
		childController.on.should.be.a('function');
		childController.emit.should.be.a('function');
	});
	it('should have an extend method', function(){
		ChildController.extend.should.be.a('function');
	});
	it('should require a model', function(){
		try { new Controller() }
		catch (err) { err.should.exist };
	});

	describe('model listener methods', function(){
		it('should have a created method',function(){
			childController.created.should.be.a('function');
		});
		it('should have a updated method',function(){
			childController.updated.should.be.a('function');
		});
		it('should have a deleted method',function(){
			childController.deleted.should.be.a('function');
		});
	});

	describe('Events', function(){
		var testId;
		it('should emit model:created after updating sets', function(done){
			childController.once('model:created',function(object){
				object.should.be.a('object');
				testId = object.id;
				done();
			});
			childModel.create({ parentModel : ParentModel.name , parentId : parentModel.id, three: 'events created test', four : 4 });
		});
		it('should emit model:deleted after removing a deleted model from sets', function(done){
			childController.once('model:deleted',function(object){
				object.should.be.a('object');
				testId = object.id;
				done();
			});
			childModel.del({parentModel : ParentModel.name, parentId : parentModel.id, id : testId});
		});
	});
	
	describe('Sets', function (){
		// Sets keep a recored ordered according to the 0th value listed
		// in the array. it can be any value.
		it('should require a sets object with array values', function(){
			try { new Controller({model : testChildModel}); }
			catch (err) { err.should.exist }
		});
		it('get method should return an array of read model objects',function(done){
			childController.get.should.be.a('function');
			childController.get('all', ParentModel.name, parentModel.id, function(set){
				set.should.be.a('object');
				set.length.should.be.a('number');
				done();
			});
		});
		it('get method should return false if the set doesn\'t exist', function(done){
			childController.get('adfghjk',ParentModel.name, parentModel.id,function(set){
				set.should.equal(false);
				done();
			});
		});
		it('should call add on all sets on model created event', function(done){
			childController.once('model:created',function(){
				childController.get('all', ParentModel.name, parentModel.id, function(all){
					all.should.be.a('object');
					done();
				});
			});
			childModel.create({parentModel : ParentModel.name, parentId : parentModel.id, four: 1, three: 'new object'}, function(object){
				childModelId = object.id;
			});
		});
		it('should call remove on all sets on model created event', function(done){
			childController.once('model:deleted',function(){
				childController.get('all', ParentModel.name, parentModel.id,function(all){
					all.should.be.a('object');
					done();
				});
			});
			childModel.del({ parentModel : ParentModel.name, parentId: parentModel.id, id: childModelId});
		});
	});
	describe('Indexes', function(){
		before(function(done){
			childModel.create({ parentModel : ParentModel.name, parentId : parentModel.id, three : 'kickass', four : 2}, function(newObject){
				done();
			});
		});

		it.skip('should have a find method', function(done){
			childController.find('kickass', ParentModel.name, parentModel.id,function(object){
				object.length.should.equal(1);
				object[0].should.be.a('object');
				done();
			});
		});
	});
});

function setup (callback) {
	var TestModel = Model.extend({
		name : 'parents',
		attributes : {
			one : ['string'],
			two : ['number']
		}
	});
	var testModel = new TestModel();

	var TestChildModel = ChildModel.extend({
		name : 'children',
		attributes : {
			three : ['string', true, false, 'apples'],
			four : ['number', true]
		}
	});
	var testChildModel = new TestChildModel();

	var TestChildController = ChildController.extend({
		model : testChildModel,
		sets : {
			four : ['four'],
			recent : ['created']
		},
		indexes : ['three']
	});

	callback(testModel, testChildModel, undefined, new TestChildController());
}




