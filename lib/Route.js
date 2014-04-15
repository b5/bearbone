var Protocol = require('./Protocol');

var Route = Protocol.extend({
	name : "route",
  initialize : function (Target) {
    if (!Target.name) { throw "route protocol target object must have a name"; }
    this.sets = Target.sets || {};
  },
	action : function (method, params, destination) {
		var fn = this.identifyMethod(method)
			, ctx = this.identifyCtx(method)
			, args = Array.prototype.slice.call(arguments,1,arguments.length)
			, destination = args.pop();

		return function (req,res,next) {
			var a = [];

			args.forEach(function(arg,i){
				if (typeof arg === "function") { a.push(arg(req,res,next)); }
				else { a.push(arg); }
			});

			a.push(function (err,data){
				if (err) { return next(err); }
				res.locals[destination] = data;
				next();
			});

			fn.apply(ctx,a);
		};
	},
	json : function (name) {
		return function (req,res) {
			res.json(res.locals[name]);
		}
	},
	api : function (name) {
		return function (req,res) {
			res.locals.meta || (res.locals.meta = { code : 200 })
			res.json({
				"meta" : res.locals.meta,
				"data" : res.locals[name],
				"pagination" : res.locals.pagination || {}
			});
		}
	},
	render : function (view) {
		return function (req,res) {
			res.render(view);
		}
	},

	identifyMethod : function (name) {
		var self = this, args = name.split('.'), fn = this.target;
		if (args.length > 1) {
			if (typeof self.target[args[0]] !== "object") {
				throw new self.Error('Invalid Object: ' + self.target + "." + name);
			}
			while (args.length) {
				if (!fn) {
					throw new self.Error("Invalid Method: " + self.target + "." + name);
				}
				fn = fn[args.splice(0,1)];
			}
			return fn;
		} else if (typeof self.target[name] === "function" ) {
			return self.target[name];
		} else {
			throw new self.Error('Invalid Method: ' + self.target + "." + name);
		}
	},

	identifyCtx : function (name) {
		var self = this, args = name.split('.'), ctx = this.target;

		if (args.length > 1) {
			// pop off the function name.
			args.pop();

			if (typeof self.target[args[0]] !== "object") {
				throw new self.Error('Invalid Context: ' + self.target + "." + name);
			}
			while (args.length) {
				if (!ctx) {
					throw new self.Error("Invalid Context: " + self.target + "." + name);
				}
				ctx = ctx[args.splice(0,1)];
			}
			return ctx;
		} else if (typeof self.target[name] === "object" ) {
			return self.target[name];
		} else {
			return ctx;
		}
	},

	redirect : function (name) {
		return function (req,res) {
			res.redirect(name);
		}
	},
	local : function () {
		var args = Array.prototype.slice.call(arguments,0,arguments.length);
		return function (req,res,next) {
			var result = res.locals || {};
			args.forEach(function(arg){
				result = result[arg] ? result[arg] : result;
			});
			return result;
		}
	},
	param : function (name){
		return function (req,res,next) {
			return req.params[name] || req.query[name] || req.body[name];
		}
	},
	body : function () {
		return function (req,res,next) { return req.body; }
	},
	bind : function (fn, ctx) {
		return Function.prototype.bind.apply(fn,slice.call(arguments,1));
	},
	dataNext : function (name,ctx,req,res,next) {
		return Function.prototype.bind.call(function(err,data) {
			if (err) { return next(err); }
			res.locals[name] = data;
			next();
		},ctx);
	},
});

module.exports = Route;