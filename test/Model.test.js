var should = require('should')
	, Model = require('../lib/Model')
	, db = require('ninjazord');

describe('Model', function(){
	var TestModel = Model.extend({
				name : "test",
				attributes: {
					body : ['string', true],
					defaultAttr : ['string', true, false, 'Store Me.']
				}
			})
		, model = new TestModel
		, body = 'test body'
		, createdModelId = undefined;

	before(function(done){
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			done();
		});
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
	it('should have a attributes entity', function(){
		model.attributes.should.be.a('object');
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
			model.update({ id : createdModelId, body : body }, function(newObject){
				newObject.body.should.equal(body);
				done();
			});
		});
		it('should emit a updated event on creation & pass along the object, and the old object', function(done){
			body = 'updated test body two!';
			model.once('updated', function(object, oldObject){
				object.should.be.a('object');
				object.body.should.equal(body);
				oldObject.should.be.a('object');
				oldObject.body.should.equal('updated test body');
				done();
			});
			model.update({ id: createdModelId, body : body });
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

	describe('Attribute Type Validation & Coercion', function(){
		var TypeTestModel = Model.extend({
			name : 'typeTests',
			attributes : {
				num : ['number', true],
				str : ['str', true],
				bool: ['boolean']
			}
		});

		var typeTest = new TypeTestModel();
		it('should not store numbers that coerce to "NaN"', function(){
			typeTest.validate({ num : 'SMOKE', str : 'a'}).should.equal(false);
			typeTest.validate({ num : '1234e5ehds', str : 'a'}).should.equal(false);
		});

		it('shouldn\'t accept numbers for strings', function(){
			typeTest.validate({num : 5, str : 5}).should.equal(false);
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
				object.publicWasCalled.should.equal(true);
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
				object.privateWasCalled.should.equal(true);
				complete();
			});

			model.once('updated', function(object){
				object.privateWasCalled.should.equal(true);
				complete();
			});

			model.once('deleted', function(object){
				object.privateWasCalled.should.equal(true);
				complete();
			});

			model.create({ body : body, dontCreateMe : 'do not create me'}, function(object){
				object.body = 'updated body';
				model.update(object, function(){
					model.del(object.id);
				});
			});
		});
	});

	describe('Object attribute types', function(){
		var ObjectModel = Model.extend({
			name : 'objectModels',
			attributes : {
				one : ['string',true,false,'attrOne'],
				two : ['object',true,false,{ example : 'value' }],
				three : ['object']
			}
		});
		var objectModel = new ObjectModel()
			, object;
			
		it('should be able to create', function(done){
			objectModel.create({ one : 'testOne', two : { HUH : 'rational', test : 'value'}, three : { test : 'threeValue' } }, function(newObject){
				object = newObject;
				object.should.be.a('object');
				done();
			});
		});

		it('should be able to read back', function(done){
			objectModel.read(object.id, function(readObject){
				object = readObject;
				object.two.should.be.a('object');
				object.two.test.should.equal('value');
				object.two.HUH.should.equal('rational');
				object.three.test.should.equal('threeValue');
				done();
			});
		});

		it('should be able to update (and delete keys not included with the update)', function(done){
			objectModel.update({ id: object.id, two : { one: 'newValue', three : 'otherNewValue'} }, function(updatedObject){
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

	describe.skip('Array Attribute Types', function (){

	});

	// Reference Listeners
	describe('References', function(){
		var Company, Employee, company, companyTwo, employee;

		before(function(done){
			Employee = Model.extend({
				name : 'employees',
				attributes : {
					'companyId' : ['number', true],
					'name' : ['string',true, false, 'Allen Iverson'],
					'position' : ['string', true, false, 'IT Technician']
				}
			});
			
			Employee = new Employee();

			Company = Model.extend({
				name : 'companies',
				attributes : {
					'name' : ['string', true, false, 'Acme Corp.']
				},
				references : {
					employees : { model : Employee, key : 'companyId' }
				}
			});

			Company = new Company();

			Company.create({ name : 'test company'}, function (newCompany){
				company = newCompany;
				company.should.be.a('object');
				Company.create({ name : 'second test company'}, function (newCompany){
					companyTwo = newCompany;
					companyTwo.should.be.a('object');
					done();
				});
			});
		});

		it('should listen for references being created', function(done){
			Company.once('referenceAdded', function(id, refId){
				id.should.equal(company.id);
				refId.should.be.a('number');
				done();
			});
			Employee.create({ companyId : company.id }, function(newEmployee){
				employee = newEmployee;
				employee.should.be.a('object');
			}).should.not.equal(false);
		});
		it('should be able to spit that reference back', function(done){
			Company.getReferences(company.id, 'employees', function(references){
				references.should.be.a('object');
				references[0].should.equal(employee.id);
				done();
			});
		});
		it('should be able to read those references', function(done){
			Company.readReferences(company.id, 'employees', function(references){
				references.should.be.a('object');
				references[0].should.be.a('object');
				done();
			});
		});
		it('should move the reference on update', function(done){
			var tasks = 2;
			function over () { if (--tasks === 0) done(); }
			Company.once('referenceAdded', function(id, refId){
				id.should.equal(companyTwo.id);
				refId.should.equal(employee.id);
				over();
			});
			Company.once('referenceRemoved', function(id, refId){
				id.should.equal(company.id);
				refId.should.equal(employee.id);
				over();
			});
			Employee.update({ id : employee.id, companyId : companyTwo.id}, function(updatedEmployee){
				employee = updatedEmployee;
				employee.should.be.a('object');
			}).should.not.equal(false);
		});
		it('should delete the reference on delete', function(done){
			Company.once('referenceRemoved', function(id, refId){
				id.should.equal(companyTwo.id);
				refId.should.equal(employee.id);
				done();
			});
			Employee.del(employee.id).should.not.equal(false);
		});
	});

	describe('counts & totals', function(){
		it('count', function (done){
			model.count(function(count){
				count.should.be.a('number');
				done();
			});
		});
	});
});