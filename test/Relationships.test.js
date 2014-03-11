var should = require('should')
	, Relationships = require('../lib/Relationships')
	, EventEmitter = require('events').EventEmitter
	, db = require('ninjazord');


describe('Relationships', function(){
	var Target = new EventEmitter
		, SingleReference = new EventEmitter
		, GroupReference = new EventEmitter
		, FilteredReference = new EventEmitter
		, relationship;

	Target.name = "targets";
	Target.relationships = {
		"singles" : {	model : SingleReference, key : "targetId", added : "singleAdded", removed : "singleRemoved" },
		"manies" : { model : GroupReference, key : "targetId", sortedSets : ['created','updated'], added : "groupAdded", removed : "groupRemoved" },
		"filtered" : { model : FilteredReference, key : "targetId", filter : "shouldAddFiltered", added : "filteredAdded", removed : "filteredRemoved" }
	};

	SingleReference.name = "singles";
	GroupReference.name = "manies";

	before(function(done){
		// testModel.verbose = true;
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			done();
		});
	});

	describe('construction', function (){
		it('should reject non-EventEmitter targets', function(){
			try {
				var relationship = new Relationships({ name : "carl" });
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should reject targets without a name', function (){
			try {
				new Relationships({});
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should accept a proper target', function(){
			relationship = new Relationships(Target);
			relationship.should.be.a('object');
			relationship.target.should.equal(Target);
		});
	});

	describe('reference adding', function (){
		it('single', function (done){
			Target.singleAdded = function (model, options) {
				model.should.be.a('object');
				model.targetId.should.equal(1);

				done();
			};
			SingleReference.emit('created', { id : 10, targetId : 1, created : new Date().valueOf(), updated : new Date().valueOf() });
		});
		it('group', function (done){
			Target.groupAdded = function (model, options) {
				model.should.be.a('object');
				model.targetId.should.equal(2);
				done();
			};
			GroupReference.emit('created', { id : 25, targetId : 2, created : new Date().valueOf(), updated : undefined });
		});
	});

	describe('sorted sets', function(){
		before(function(done){
			Target.groupAdded = function (model, options) {
				model.should.be.a('object');
				model.targetId.should.equal(2);
				done();
			};
			GroupReference.emit('created', { id : 26, targetId : 2, created : new Date().valueOf(), updated : new Date().valueOf() });
		});

		it('read created',function(done){
			relationship.getSorted(2,'manies','created', function(err,res){
				should.not.exist(err);
				res.length.should.equal(2);
				res[0].should.equal('25');
				res[1].should.equal('26');
				done();
			});
		});

		it('read updated', function(done){
			relationship.getSorted(2,'manies','updated', function(err,res){
				should.not.exist(err);
				res[0].should.equal('26');
				done();
			});
		});
	});

	describe('filtered references', function(done){
		it('should call the filter function on reference creation', function(done){
			Target.shouldAddFiltered = function(model, options) {
				done();
				// redefine here so we don't keep calling "done"
				Target.shouldAddFiltered = function (model, options) { return model.shouldAdd; };
				return model.shouldAdd;
			}
			FilteredReference.emit('created', { id : 26, targetId : 2, created : new Date().valueOf(), updated : new Date().valueOf() });
		});
		it('shouldn\'t add if when the model fails the test', function(done){
			Target.filteredAdded = function (model, options) {
				throw "this shouldn't call";
			}
			FilteredReference.emit('created', { shouldAdd : false, id : 26, targetId : 2, created : new Date().valueOf(), updated : new Date().valueOf() });
			setTimeout(done,40);
		});
		it('should add when the model passes the filter test', function(done){
			Target.filteredAdded = function (model, options) {
				done();
			}
			FilteredReference.emit('created', { shouldAdd : true, id : 26, targetId : 2, created : new Date().valueOf(), updated : new Date().valueOf() });
		});
	});

	describe('reference removal', function(){

	});


	// Reference Listeners
	describe.skip('References', function(){
		var Company, Employee, Accountant, company, companyTwo, employee, accountant;

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

			Accountant = Model.extend({
				name : "accountants",
				attributes : {
					name : ["string", true, false, "walter"],
					companyId : ["number", true]
				}
			});

			Accountant = new Accountant();

			Company = Model.extend({
				name : 'companies',
				attributes : {
					'name' : ['string', true, false, 'Acme Corp.']
				},
				references : {
					employees : { model : Employee, key : 'companyId', added : 'employeeCreated', countAttribute : true },
					accountants : { model : Accountant, key : 'companyId', currentAttribute : 'accountantId', deleteRule : 'cascade' }
				},
				employeeCreated : function (model) { }
			});

			Company = new Company();

			Company.create({ name : 'test company'}, function (err, _company){
				company = _company;
				company.should.be.a('object');
				Company.create({ name : 'second test company'}, function (err, _company){
					companyTwo = _company;
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
			Employee.create({ companyId : company.id }, function(err, _employee){
				employee = _employee;
				employee.should.be.a('object');
			}).should.not.equal(false);
		});
		it('should be able to spit that reference back', function(done){
			Company.getReferences(company.id, 'employees', function(err, _references){
				_references.should.be.a('object');
				_references[0].should.equal(employee.id);
				done();
			});
		});
		it('should be able to read those references', function(done){
			Company.readReferences(company.id, 'employees', function(err,_references){
				_references.should.be.a('object');
				_references[0].should.be.a('object');
				done();
			});
		});
		it('should be able to check if a reference exists', function(done){
			Company.referenceExists(company.id, employee.id, 'employees', function(err,_exists){
				_exists.should.equal(true);
				done();
			});
		});
		it('should be able to check if a reference does\'t exist', function(done){
			Company.referenceExists(company.id, 7891456, 'employees', function(err,_exists){
				_exists.should.equal(false);
				done();
			});
		});
		it('should keep a count attribute if the count option is set', function (done){
			Company.read(company.id, function (err, company){
				company.employeesCount.should.be.a('number');
				company.employeesCount.should.equal(1);
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
			Employee.update({ id : employee.id, companyId : companyTwo.id}, function(err, _employee){
				employee = _employee;
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
		it('should call the supplied callback on addition', function(done){
			Company.references.employees.added = function (employee) {
				this.name.should.equal('companies');
				employee.should.be.a('object');
				employee.name.should.equal('Fizz Buzz');
				done();
			};
			Employee.create({ companyId : company.id, name : 'Fizz Buzz' });
		});

		it('should store the most recent id to an attribute on create', function(done){
			Company.once("referenceAdded", function(id, refId){
				Company.read(company.id, function(err,_company){
					company = _company;
					company.accountantId.should.be.a('number');
					done();
				});
			});
			Accountant.create({ name : "Markus", companyId : company.id }, function(err,_accountant) {
				should.not.exist(err);
				accountant = _accountant;
			});
		});

		it('should cascade accountant deletion on delete', function(done){
			Company.once('deleted',function(company){
				Accountant.read(accountant.id, function(err,_accountant){
					_accountant.should.equal(false);
					done();
				})
			});
			Company.del(company.id);
		});

		it('reference sorted sets', function(done){
			done();
		});
		it('reference sorted sets get', function(done){
			done();
		});
		it('reference sorted sets read', function(done){
			done();
		});
		it('reference sorted sets read reverse', function(done){
			done();
		});
	});
});