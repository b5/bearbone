var should = require('should')
	, Model = require('../lib/Model')
	, ChildModel = require('../lib/ChildModel')
	, db = require('ninjazord');

// @todo - childModel method signatures should be
// adapted to be the same as a regular model, just requiring
// a parentModel & parentId parameters to be created.
describe('Child Model', function(){
	var TestChildModel = ChildModel.extend({
				name: 'childModels',
				storedAttributes: {
					id: ['number'],
					body: ['string', true],
					parentModel: ['string', true, true],
					parentId: ['number', true, true],
				}
			})
		, createAttrs = {
				parentModel: 'parentModels',
				parentId: undefined,
				body: 'kickass!',
				deleteMe: 'I should get deleted'
			}
		, externalIdCreateAttrs = {
				parentModel: 'parentModels',
				parentId: undefined,
				body: 'kickass!',
				deleteMe: 'I should get deleted',
				id : 27
			}
		, updateAttrs = {
				parentModel: undefined,
				parentId: undefined,
				body: 'updated body',
				deleteMe: 'I should not be added'
			}
		, childModel = new TestChildModel()
		, parentObject = {}
		, childObject = {}
		, childOfChildObject = {};

	before(function(done){
		db.setPrefix('tests.');
		db.nukeNamespace('tests.', function(){
			db.createObject('parentModels', { attrOne :'test', attrTwo: 2, attrThree: true}, function(object){
				parentObject = object;
				parentObject.should.be.a('object');
				done();
			});
		});
	});

	it('should be a Model object with a bunch of methods', function(){
		(childModel instanceof Model).should.equal(true);
	});

	describe('CRUD methods', function(){
		/* ------ * Create * ------ */
		it('create should reject an object without parentModel & parentId attributes specified', function(done){
			childModel.create({body: 'stuff!' },function(object){
				object.should.equal(false);
				done();
			});
		});
		it('create should return false if the parent doesn\'t exist', function(done){
			childModel.create(createAttrs,function(object){
				object.should.equal(false);
				done();
			});
		});
		it('create work with valid parent & attributes', function(done){
			createAttrs.parentId = parentObject.id;

			childModel.verbose = true;
			
			childModel.create(createAttrs, function(object){
				object.should.be.a('object');
				object.id.should.be.a('number');
				object.parentModel.should.equal('parentModels');
				object.parentId.should.equal(parentObject.id);
				object.body.should.equal(createAttrs.body);
				childObject = object;
				done();
			});
		});
		it('create should work if fed an object namespaced two levels deep', function(done){
			createAttrs.parentModel = 'parentModels.' + parentObject.id + '.' + childModel.name;
			createAttrs.parentId = childObject.id;
			childModel.create(createAttrs, function(object){
				object.should.be.a('object');
				object.body.should.equal(createAttrs.body);
				object.parentModel.should.equal(createAttrs.parentModel);
				childOfChildObject = object;
				done();
			});
		});
		it('create should emit a created event',function(done){
			childModel.once('created', function(object){
				object.body.should.equal("oh cool!");
				done();
			});
			childModel.create({ parentModel : 'parentModels', parentId : parentObject.id, body : "oh cool!" }).should.not.equal(false);
		});
		/* ------ * Read * ------ */
		it('read should require the parent & id', function(done){
			childModel.read({ parentModel: 'parentModels', parentId: parentObject.id, id: childObject.id }, function(object){
				object.should.be.a('object');
				done();
			});
		});
		it('read should work with children-of-children objects', function(done){
			var nameSpace = 'parentModels.' + parentObject.id + '.' + childModel.name;
			childModel.read({ parentModel: nameSpace, parentId: childObject.id, id: childOfChildObject.id}, function(object){
				object.should.be.a('object');
				done();
			});
		});
		/* ------ * Update * ------ */
		it('update should return false without a parent & parentId argument', function(done){
			childModel.update(updateAttrs, function(object){
				object.should.equal(false);
				done();
			});
		});
		it('update should work if supplied parentModel, parentId, & id params',function(done){
			childObject.id.should.be.a('number');
			updateAttrs.parentModel = 'parentModels';
			updateAttrs.parentId = parentObject.id;
			updateAttrs.id = childObject.id;

			childModel.update(updateAttrs, function(object){
				object.should.be.a('object');
				object.body.should.equal(updateAttrs.body);
				should.not.exist(object.deleteMe);
				done();
			});
		});
		it('update should work on children-of-children objects', function(done){
			childOfChildObject.should.be.a('object');
			var nameSpace = 'parentModels.' + parentObject.id + '.' + childModel.name;
			updateAttrs.parentModel = nameSpace;
			updateAttrs.parentId = childObject.id;
			updateAttrs.id = childOfChildObject.id;

			childModel.update(updateAttrs, function(object){
				object.should.be.a('object');
				object.body.should.equal(updateAttrs.body);
				should.not.exist(object.deleteMe);
				done();
			});
		});
		it('update should emit an updated event', function(done){
			updateAttrs.body = 'update again!';

			childModel.once('updated', function(object){
				object.body.should.equal(updateAttrs.body);
				should.not.exist(object.deleteMe);
				done();
			});
			childModel.update(updateAttrs).should.not.equal(false);
		});
		/* ------ * Del * ------ */
		it('del should work', function(done){
			childModel.once('deleted', function(object){
				object.should.be.a('object');
				done();
			});

			childModel.del({ parentModel : 'parentModels', parentId: parentObject.id, id: childModel.id }, function(res){
			});
		});
	});

	describe('Object attribute types', function(){
		var ObjectModel = ChildModel.extend({
			name : 'objectModels',
			storedAttributes : {
				one : ['string',true,false,'attrOne'],
				two : ['object',true,false,{ example : 'value' }],
				three : ['object']
			}
		});
		var objectModel = new ObjectModel()
			, object;

		it('should be able to create', function(done){
			objectModel.create({ parentModel : 'parentModels', parentId : parentObject.id, one : 'testOne', two : { HUH : 'rational', test : 'value'}, three : { test : 'threeValue' } }, function(newObject){
				object = newObject;
				object.should.be.a('object');
				done();
			});
		});

		it('should be able to read back', function(done){
			objectModel.read({ parentModel : 'parentModels', parentId : parentObject.id, id : object.id }, function(readObject){
				object = readObject;
				object.two.should.be.a('object');
				object.two.test.should.equal('value');
				object.two.HUH.should.equal('rational');
				object.three.test.should.equal('threeValue');
				done();
			});
		});

		it('should be able to update (and delete keys not included with the update)', function(done){
			objectModel.update({ parentModel : 'parentModels', parentId: parentObject.id, id : object.id, two : { one: 'newValue', three : 'otherNewValue'} }, function(updatedObject){
				object = updatedObject;
				should.not.exist(object.two.HUH);
				should.not.exist(object.two.test);

				object.three.test.should.equal('threeValue');
				object.two.one.should.equal('newValue');
				object.two.three.should.equal('otherNewValue');

				done();
			});
		});
	});


	describe('External ID childModel', function(){
		var ExternalIdTestModel = ChildModel.extend({
				name : 'externals',
				externalId : true,
				storedAttributes : {
					body : ['string', true]
				}
			})
			, externalChildModel = new ExternalIdTestModel();

		it('should reject create commands that lack an ID', function(done){
			delete createAttrs.id;
			externalChildModel.create(createAttrs, function(newModel){
				newModel.should.equal(false);
				done();
			});
		});
		it('should create with an external model', function(done){
			createAttrs.id = 27;
			externalChildModel.create(createAttrs, function(newModel){
				newModel.should.be.a('object');
				newModel.id.should.equal(createAttrs.id);
				done();
			});
		});
	});

});