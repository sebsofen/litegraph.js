//packer version
(function(global){
// *************************************************************
//   LiteGraph CLASS                                     *******
// *************************************************************

/**
* The Global Scope. It contains all the registered node classes.
*
* @class LiteGraph
* @constructor
*/

var LiteGraph = global.LiteGraph = {

	NODE_TITLE_HEIGHT: 16,
	NODE_SLOT_HEIGHT: 15,
	NODE_WIDTH: 140,
	NODE_MIN_WIDTH: 50,
	NODE_COLLAPSED_RADIUS: 10,
	NODE_COLLAPSED_WIDTH: 80,
	CANVAS_GRID_SIZE: 10,
	NODE_TITLE_COLOR: "#222",
	NODE_DEFAULT_COLOR: "#999",
	NODE_DEFAULT_BGCOLOR: "#444",
	NODE_DEFAULT_BOXCOLOR: "#AEF",
	NODE_DEFAULT_SHAPE: "box",
	MAX_NUMBER_OF_NODES: 1000, //avoid infinite loops
	DEFAULT_POSITION: [100,100],//default node position
	node_images_path: "",

	//enums
	INPUT: 1, 
	OUTPUT: 2, 

	EVENT: -1, //for outputs
	ACTION: -1, //for inputs

	ALWAYS: 0,
	ON_EVENT: 1,
	NEVER: 2,

	proxy: null, //used to redirect calls

	debug: false,
	throw_errors: true,
	registered_node_types: {}, //nodetypes by string
	node_types_by_file_extension: {}, //used for droping files in the canvas
	Nodes: {}, //node types by classname

	/**
	* Register a node class so it can be listed when the user wants to create a new one
	* @method registerNodeType
	* @param {String} type name of the node and path
	* @param {Class} base_class class containing the structure of a node
	*/

	registerNodeType: function(type, base_class)
	{
		if(!base_class.prototype)
			throw("Cannot register a simple object, it must be a class with a prototype");
		base_class.type = type;

		if(LiteGraph.debug)
			console.log("Node registered: " + type);

		var categories = type.split("/");

		var pos = type.lastIndexOf("/");
		base_class.category = type.substr(0,pos);
		//info.name = name.substr(pos+1,name.length - pos);

		//extend class
		if(base_class.prototype) //is a class
			for(var i in LGraphNode.prototype)
				if(!base_class.prototype[i])
					base_class.prototype[i] = LGraphNode.prototype[i];

		this.registered_node_types[ type ] = base_class;
		if(base_class.constructor.name)
			this.Nodes[ base_class.constructor.name ] = base_class;

		//warnings
		if(base_class.prototype.onPropertyChange)
			console.warn("LiteGraph node class " + type + " has onPropertyChange method, it must be called onPropertyChanged with d at the end");

		if( base_class.supported_extensions )
		{
			for(var i in base_class.supported_extensions )
				this.node_types_by_file_extension[ base_class.supported_extensions[i].toLowerCase() ] = base_class;
		}
	},

	/**
	* Adds this method to all nodetypes, existing and to be created
	* (You can add it to LGraphNode.prototype but then existing node types wont have it)
	* @method addNodeMethod
	* @param {Function} func
	*/
	addNodeMethod: function( name, func )
	{
		LGraphNode.prototype[name] = func;
		for(var i in this.registered_node_types)
		{
			var type = this.registered_node_types[i];
			if(type.prototype[name])
				type.prototype["_" + name] = type.prototype[name]; //keep old in case of replacing
			type.prototype[name] = func;
		}
	},

	/**
	* Create a node of a given type with a name. The node is not attached to any graph yet.
	* @method createNode
	* @param {String} type full name of the node class. p.e. "math/sin"
	* @param {String} name a name to distinguish from other nodes
	* @param {Object} options to set options
	*/

	createNode: function( type, title, options )
	{
		var base_class = this.registered_node_types[type];
		if (!base_class)
		{
			if(LiteGraph.debug)
				console.log("GraphNode type \"" + type + "\" not registered.");
			return null;
		}

		var prototype = base_class.prototype || base_class;

		title = title || base_class.title || type;

		var node = new base_class( name );
		node.type = type;

		if(!node.title) node.title = title;
		if(!node.properties) node.properties = {};
		if(!node.properties_info) node.properties_info = [];
		if(!node.flags) node.flags = {};
		if(!node.size) node.size = node.computeSize();
		if(!node.pos) node.pos = LiteGraph.DEFAULT_POSITION.concat();
		if(!node.mode) node.mode = LiteGraph.ALWAYS;

		//extra options
		if(options)
		{
			for(var i in options)
				node[i] = options[i];								
		}

		return node;
	},

	/**
	* Returns a registered node type with a given name
	* @method getNodeType
	* @param {String} type full name of the node class. p.e. "math/sin"
	* @return {Class} the node class
	*/

	getNodeType: function(type)
	{
		return this.registered_node_types[type];
	},


	/**
	* Returns a list of node types matching one category
	* @method getNodeType
	* @param {String} category category name
	* @return {Array} array with all the node classes
	*/

	getNodeTypesInCategory: function(category)
	{
		var r = [];
		for(var i in this.registered_node_types)
			if(category == "")
			{
				if (this.registered_node_types[i].category == null)
					r.push(this.registered_node_types[i]);
			}
			else if (this.registered_node_types[i].category == category)
				r.push(this.registered_node_types[i]);

		return r;
	},

	/**
	* Returns a list with all the node type categories
	* @method getNodeTypesCategories
	* @return {Array} array with all the names of the categories 
	*/

	getNodeTypesCategories: function()
	{
		var categories = {"":1};
		for(var i in this.registered_node_types)
			if(this.registered_node_types[i].category && !this.registered_node_types[i].skip_list)
				categories[ this.registered_node_types[i].category ] = 1;
		var result = [];
		for(var i in categories)
			result.push(i);
		return result;
	},

	//debug purposes: reloads all the js scripts that matches a wilcard
	reloadNodes: function (folder_wildcard)
	{
		var tmp = document.getElementsByTagName("script");
		//weird, this array changes by its own, so we use a copy
		var script_files = [];
		for(var i in tmp)
			script_files.push(tmp[i]);


		var docHeadObj = document.getElementsByTagName("head")[0];
		folder_wildcard = document.location.href + folder_wildcard;

		for(var i in script_files)
		{
			var src = script_files[i].src;
			if( !src || src.substr(0,folder_wildcard.length ) != folder_wildcard)
				continue;

			try
			{
				if(LiteGraph.debug)
					console.log("Reloading: " + src);
				var dynamicScript = document.createElement("script");
				dynamicScript.type = "text/javascript";
				dynamicScript.src = src;
				docHeadObj.appendChild(dynamicScript);
				docHeadObj.removeChild(script_files[i]);
			}
			catch (err)
			{
				if(LiteGraph.throw_errors)
					throw err;
				if(LiteGraph.debug)
					console.log("Error while reloading " + src);
			}
		}

		if(LiteGraph.debug)
			console.log("Nodes reloaded");
	},
	
	//separated just to improve if it doesnt work
	cloneObject: function(obj, target)
	{
		if(obj == null) return null;
		var r = JSON.parse( JSON.stringify( obj ) );
		if(!target) return r;

		for(var i in r)
			target[i] = r[i];
		return target;
	},

	isValidConnection: function( type_a, type_b )
	{
		if( !type_a ||  //generic output
			!type_b || //generic input
			type_a == type_a || //same type (is valid for triggers)
			(type_a !== LiteGraph.EVENT && type_b !== LiteGraph.EVENT && type_a.toLowerCase() == type_b.toLowerCase()) ) //same type
			return true;
		return false;
	}
};

if(typeof(performance) != "undefined")
  LiteGraph.getTime = function getTime() { return performance.now(); }
else
  LiteGraph.getTime = function getTime() { return Date.now(); }




 

//*********************************************************************************
// LGraph CLASS                                  
//*********************************************************************************

/**
* LGraph is the class that contain a full graph. We instantiate one and add nodes to it, and then we can run the execution loop.
*
* @class LGraph
* @constructor
*/

global.LGraph = LiteGraph.LGraph = function LGraph()
{
	if (LiteGraph.debug)
		console.log("Graph created");
	this.list_of_graphcanvas = null;
	this.clear();
}

//default supported types
LGraph.supported_types = ["number","string","boolean"];

//used to know which types of connections support this graph (some graphs do not allow certain types)
LGraph.prototype.getSupportedTypes = function() { return this.supported_types || LGraph.supported_types; }

LGraph.STATUS_STOPPED = 1;
LGraph.STATUS_RUNNING = 2;

/**
* Removes all nodes from this graph
* @method clear
*/

LGraph.prototype.clear = function()
{
	this.stop();
	this.status = LGraph.STATUS_STOPPED;
	this.last_node_id = 0;

	//nodes
	this._nodes = [];
	this._nodes_by_id = {};

	//links
	this.last_link_id = 0;
	this.links = {}; //container with all the links

	//iterations
	this.iteration = 0;

	this.config = {
	};

	//timing
	this.globaltime = 0;
	this.runningtime = 0;
	this.fixedtime =  0;
	this.fixedtime_lapse = 0.01;
	this.elapsed_time = 0.01;
	this.starttime = 0;

	//globals
	this.global_inputs = {};
	this.global_outputs = {};

	//this.graph = {};
	this.debug = true;

	this.change();

	this.sendActionToCanvas("clear");
}

/**
* Attach Canvas to this graph
* @method attachCanvas
* @param {GraphCanvas} graph_canvas 
*/

LGraph.prototype.attachCanvas = function(graphcanvas)
{
	if(graphcanvas.constructor != LGraphCanvas)
		throw("attachCanvas expects a LGraphCanvas instance");
	if(graphcanvas.graph && graphcanvas.graph != this)
		graphcanvas.graph.detachCanvas( graphcanvas );

	graphcanvas.graph = this;
	if(!this.list_of_graphcanvas)
		this.list_of_graphcanvas = [];
	this.list_of_graphcanvas.push(graphcanvas);
}

/**
* Detach Canvas from this graph
* @method detachCanvas
* @param {GraphCanvas} graph_canvas 
*/

LGraph.prototype.detachCanvas = function(graphcanvas)
{
	if(!this.list_of_graphcanvas)
		return;

	var pos = this.list_of_graphcanvas.indexOf( graphcanvas );
	if(pos == -1)
		return;
	graphcanvas.graph = null;
	this.list_of_graphcanvas.splice(pos,1);
}

/**
* Starts running this graph every interval milliseconds.
* @method start
* @param {number} interval amount of milliseconds between executions, default is 1
*/

LGraph.prototype.start = function(interval)
{
	if(this.status == LGraph.STATUS_RUNNING) return;
	this.status = LGraph.STATUS_RUNNING;

	if(this.onPlayEvent)
		this.onPlayEvent();

	this.sendEventToAllNodes("onStart");

	//launch
	this.starttime = LiteGraph.getTime();
	interval = interval || 1;
	var that = this;	

	this.execution_timer_id = setInterval( function() { 
		//execute
		that.runStep(1); 
	},interval);
}

/**
* Stops the execution loop of the graph
* @method stop execution
*/

LGraph.prototype.stop = function()
{
	if(this.status == LGraph.STATUS_STOPPED)
		return;

	this.status = LGraph.STATUS_STOPPED;

	if(this.onStopEvent)
		this.onStopEvent();

	if(this.execution_timer_id != null)
		clearInterval(this.execution_timer_id);
	this.execution_timer_id = null;

	this.sendEventToAllNodes("onStop");
}

/**
* Run N steps (cycles) of the graph
* @method runStep
* @param {number} num number of steps to run, default is 1
*/

LGraph.prototype.runStep = function(num)
{
	num = num || 1;

	var start = LiteGraph.getTime();
	this.globaltime = 0.001 * (start - this.starttime);

	var nodes = this._nodes_in_order ? this._nodes_in_order : this._nodes;
	if(!nodes)
		return;

	try
	{
		//iterations
		for(var i = 0; i < num; i++)
		{
			for( var j = 0, l = nodes.length; j < l; ++j )
			{
				var node = nodes[j];
				if( node.mode == LiteGraph.ALWAYS && node.onExecute )
					node.onExecute();
			}

			this.fixedtime += this.fixedtime_lapse;
			if( this.onExecuteStep )
				this.onExecuteStep();
		}

		if( this.onAfterExecute )
			this.onAfterExecute();
		this.errors_in_execution = false;
	}
	catch (err)
	{
		this.errors_in_execution = true;
		if(LiteGraph.throw_errors)
			throw err;
		if(LiteGraph.debug)
			console.log("Error during execution: " + err);
		this.stop();
	}

	var elapsed = LiteGraph.getTime() - start;
	if (elapsed == 0)
		elapsed = 1;
	this.elapsed_time = 0.001 * elapsed;
	this.globaltime += 0.001 * elapsed;
	this.iteration += 1;
}

/**
* Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
* nodes with only inputs.
* @method updateExecutionOrder
*/
	
LGraph.prototype.updateExecutionOrder = function()
{
	this._nodes_in_order = this.computeExecutionOrder();
}

//This is more internal, it computes the order and returns it
LGraph.prototype.computeExecutionOrder = function()
{
	var L = [];
	var S = [];
	var M = {};
	var visited_links = {}; //to avoid repeating links
	var remaining_links = {}; //to a
	
	//search for the nodes without inputs (starting nodes)
	for (var i = 0, l = this._nodes.length; i < l; ++i)
	{
		var n = this._nodes[i];
		M[n.id] = n; //add to pending nodes

		var num = 0; //num of input connections
		if(n.inputs)
			for(var j = 0, l2 = n.inputs.length; j < l2; j++)
				if(n.inputs[j] && n.inputs[j].link != null)
					num += 1;

		if(num == 0) //is a starting node
			S.push(n);
		else //num of input links 
			remaining_links[n.id] = num;
	}

	while(true)
	{
		if(S.length == 0)
			break;
			
		//get an starting node
		var n = S.shift();
		L.push(n); //add to ordered list
		delete M[n.id]; //remove from the pending nodes
		
		//for every output
		if(n.outputs)
			for(var i = 0; i < n.outputs.length; i++)
			{
				var output = n.outputs[i];
				//not connected
				if(output == null || output.links == null || output.links.length == 0)
					continue;

				//for every connection
				for(var j = 0; j < output.links.length; j++)
				{
					var link_id = output.links[j];
					var link = this.links[link_id];
					if(!link) continue;

					//already visited link (ignore it)
					if(visited_links[ link.id ])
						continue;

					var target_node = this.getNodeById( link.target_id );
					if(target_node == null)
					{
						visited_links[ link.id ] = true;
						continue;
					}

					visited_links[link.id] = true; //mark as visited
					remaining_links[target_node.id] -= 1; //reduce the number of links remaining
					if (remaining_links[target_node.id] == 0)
						S.push(target_node); //if no more links, then add to Starters array
				}
			}
	}
	
	//the remaining ones (loops)
	for(var i in M)
		L.push( M[i] );
		
	if( L.length != this._nodes.length && LiteGraph.debug )
		console.warn("something went wrong, nodes missing");

	//save order number in the node
	for(var i = 0; i < L.length; ++i)
		L[i].order = i;
	
	return L;
}


/**
* Returns the amount of time the graph has been running in milliseconds
* @method getTime
* @return {number} number of milliseconds the graph has been running
*/

LGraph.prototype.getTime = function()
{
	return this.globaltime;
}

/**
* Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
* @method getFixedTime
* @return {number} number of milliseconds the graph has been running
*/

LGraph.prototype.getFixedTime = function()
{
	return this.fixedtime;
}

/**
* Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
* if the nodes are using graphical actions
* @method getElapsedTime
* @return {number} number of milliseconds it took the last cycle
*/

LGraph.prototype.getElapsedTime = function()
{
	return this.elapsed_time;
}

/**
* Sends an event to all the nodes, useful to trigger stuff
* @method sendEventToAllNodes
* @param {String} eventname the name of the event (function to be called)
* @param {Array} params parameters in array format
*/

LGraph.prototype.sendEventToAllNodes = function( eventname, params, mode )
{
	mode = mode || LiteGraph.ALWAYS;

	var nodes = this._nodes_in_order ? this._nodes_in_order : this._nodes;
	if(!nodes)
		return;

	for( var j = 0, l = nodes.length; j < l; ++j )
	{
		var node = nodes[j];
		if(node[eventname] && node.mode == mode )
		{
			if(params === undefined)
				node[eventname]();
			else if(params && params.constructor === Array)
				node[eventname].apply( node, params );
			else
				node[eventname](params);
		}
	}
}

LGraph.prototype.sendActionToCanvas = function(action, params)
{
	if(!this.list_of_graphcanvas) 
		return;

	for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
	{
		var c = this.list_of_graphcanvas[i];
		if( c[action] )
			c[action].apply(c, params);
	}
}

/**
* Adds a new node instasnce to this graph
* @method add
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.add = function(node, skip_compute_order)
{
	if(!node || (node.id != -1 && this._nodes_by_id[node.id] != null))
		return; //already added

	if(this._nodes.length >= LiteGraph.MAX_NUMBER_OF_NODES)
		throw("LiteGraph: max number of nodes in a graph reached");

	//give him an id
	if(node.id == null || node.id == -1)
		node.id = this.last_node_id++;

	node.graph = this;

	this._nodes.push(node);
	this._nodes_by_id[node.id] = node;

	/*
	// rendering stuf... 
	if(node.bgImageUrl)
		node.bgImage = node.loadImage(node.bgImageUrl);
	*/

	if(node.onAdded)
		node.onAdded( this );

	if(this.config.align_to_grid)
		node.alignToGrid();

	if(!skip_compute_order)
		this.updateExecutionOrder();

	if(this.onNodeAdded)
		this.onNodeAdded(node);


	this.setDirtyCanvas(true);

	this.change();

	return node; //to chain actions
}

/**
* Removes a node from the graph
* @method remove
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.remove = function(node)
{
	if(this._nodes_by_id[node.id] == null)
		return; //not found

	if(node.ignore_remove) 
		return; //cannot be removed

	//disconnect inputs
	if(node.inputs)
		for(var i = 0; i < node.inputs.length; i++)
		{
			var slot = node.inputs[i];
			if(slot.link != null)
				node.disconnectInput(i);
		}

	//disconnect outputs
	if(node.outputs)
		for(var i = 0; i < node.outputs.length; i++)
		{
			var slot = node.outputs[i];
			if(slot.links != null && slot.links.length)
				node.disconnectOutput(i);
		}

	//node.id = -1; //why?

	//callback
	if(node.onRemoved)
		node.onRemoved();

	node.graph = null;

	//remove from canvas render
	if(this.list_of_graphcanvas)
	{
		for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
		{
			var canvas = this.list_of_graphcanvas[i];
			if(canvas.selected_nodes[node.id])
				delete canvas.selected_nodes[node.id];
			if(canvas.node_dragged == node)
				canvas.node_dragged = null;
		}
	}

	//remove from containers
	var pos = this._nodes.indexOf(node);
	if(pos != -1)
		this._nodes.splice(pos,1);
	delete this._nodes_by_id[node.id];

	if(this.onNodeRemoved)
		this.onNodeRemoved(node);

	this.setDirtyCanvas(true,true);

	this.change();

	this.updateExecutionOrder();
}

/**
* Returns a node by its id.
* @method getNodeById
* @param {String} id
*/

LGraph.prototype.getNodeById = function(id)
{
	if(id==null) return null;
	return this._nodes_by_id[id];
}

/**
* Returns a list of nodes that matches a class
* @method findNodesByClass
* @param {Class} classObject the class itself (not an string)
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByClass = function(classObject)
{
	var r = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].constructor === classObject)
			r.push(this._nodes[i]);
	return r;
}

/**
* Returns a list of nodes that matches a type
* @method findNodesByType
* @param {String} type the name of the node type
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByType = function(type)
{
	var type = type.toLowerCase();
	var r = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].type.toLowerCase() == type )
			r.push(this._nodes[i]);
	return r;
}

/**
* Returns a list of nodes that matches a name
* @method findNodesByName
* @param {String} name the name of the node to search
* @return {Array} a list with all the nodes with this name
*/

LGraph.prototype.findNodesByTitle = function(title)
{
	var result = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].title == title)
			result.push(this._nodes[i]);
	return result;
}

/**
* Returns the top-most node in this position of the canvas
* @method getNodeOnPos
* @param {number} x the x coordinate in canvas space
* @param {number} y the y coordinate in canvas space
* @param {Array} nodes_list a list with all the nodes to search from, by default is all the nodes in the graph
* @return {Array} a list with all the nodes that intersect this coordinate
*/

LGraph.prototype.getNodeOnPos = function(x,y, nodes_list)
{
	nodes_list = nodes_list || this._nodes;
	for (var i = nodes_list.length - 1; i >= 0; i--)
	{
		var n = nodes_list[i];
		if(n.isPointInsideNode( x, y, 2 ))
			return n;
	}
	return null;
}

// ********** GLOBALS *****************

//Tell this graph has a global input of this type
LGraph.prototype.addGlobalInput = function(name, type, value)
{
	this.global_inputs[name] = { name: name, type: type, value: value };

	if(this.onGlobalInputAdded)
		this.onGlobalInputAdded(name, type);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

//assign a data to the global input
LGraph.prototype.setGlobalInputData = function(name, data)
{
	var input = this.global_inputs[name];
	if (!input)
		return;
	input.value = data;
}

//assign a data to the global input
LGraph.prototype.getGlobalInputData = function(name)
{
	var input = this.global_inputs[name];
	if (!input)
		return null;
	return input.value;
}

//rename the global input
LGraph.prototype.renameGlobalInput = function(old_name, name)
{
	if(name == old_name)
		return;

	if(!this.global_inputs[old_name])
		return false;

	if(this.global_inputs[name])
	{
		console.error("there is already one input with that name");
		return false;
	}

	this.global_inputs[name] = this.global_inputs[old_name];
	delete this.global_inputs[old_name];

	if(this.onGlobalInputRenamed)
		this.onGlobalInputRenamed(old_name, name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

LGraph.prototype.changeGlobalInputType = function(name, type)
{
	if(!this.global_inputs[name])
		return false;

	if(this.global_inputs[name].type.toLowerCase() == type.toLowerCase() )
		return;

	this.global_inputs[name].type = type;
	if(this.onGlobalInputTypeChanged)
		this.onGlobalInputTypeChanged(name, type);
}

LGraph.prototype.removeGlobalInput = function(name)
{
	if(!this.global_inputs[name])
		return false;

	delete this.global_inputs[name];

	if(this.onGlobalInputRemoved)
		this.onGlobalInputRemoved(name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
	return true;
}


LGraph.prototype.addGlobalOutput = function(name, type, value)
{
	this.global_outputs[name] = { name: name, type: type, value: value };

	if(this.onGlobalOutputAdded)
		this.onGlobalOutputAdded(name, type);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

//assign a data to the global output
LGraph.prototype.setGlobalOutputData = function(name, value)
{
	var output = this.global_outputs[ name ];
	if (!output)
		return;
	output.value = value;
}

//assign a data to the global input
LGraph.prototype.getGlobalOutputData = function(name)
{
	var output = this.global_outputs[name];
	if (!output)
		return null;
	return output.value;
}


//rename the global output
LGraph.prototype.renameGlobalOutput = function(old_name, name)
{
	if(!this.global_outputs[old_name])
		return false;

	if(this.global_outputs[name])
	{
		console.error("there is already one output with that name");
		return false;
	}

	this.global_outputs[name] = this.global_outputs[old_name];
	delete this.global_outputs[old_name];

	if(this.onGlobalOutputRenamed)
		this.onGlobalOutputRenamed(old_name, name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

LGraph.prototype.changeGlobalOutputType = function(name, type)
{
	if(!this.global_outputs[name])
		return false;

	if(this.global_outputs[name].type.toLowerCase() == type.toLowerCase() )
		return;

	this.global_outputs[name].type = type;
	if(this.onGlobalOutputTypeChanged)
		this.onGlobalOutputTypeChanged(name, type);
}

LGraph.prototype.removeGlobalOutput = function(name)
{
	if(!this.global_outputs[name])
		return false;
	delete this.global_outputs[name];

	if(this.onGlobalOutputRemoved)
		this.onGlobalOutputRemoved(name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
	return true;
}


/**
* Assigns a value to all the nodes that matches this name. This is used to create global variables of the node that
* can be easily accesed from the outside of the graph
* @method setInputData
* @param {String} name the name of the node
* @param {*} value value to assign to this node
*/

LGraph.prototype.setInputData = function(name,value)
{
	var nodes = this.findNodesByName( name );
	for(var i = 0, l = nodes.length; i < l; ++i)
		nodes[i].setValue(value);
}

/**
* Returns the value of the first node with this name. This is used to access global variables of the graph from the outside
* @method setInputData
* @param {String} name the name of the node
* @return {*} value of the node
*/

LGraph.prototype.getOutputData = function(name)
{
	var n = this.findNodesByName(name);
	if(n.length)
		return m[0].getValue();
	return null;
}

//This feature is not finished yet, is to create graphs where nodes are not executed unless a trigger message is received

LGraph.prototype.triggerInput = function(name,value)
{
	var nodes = this.findNodesByName(name);
	for(var i = 0; i < nodes.length; ++i)
		nodes[i].onTrigger(value);
}

LGraph.prototype.setCallback = function(name,func)
{
	var nodes = this.findNodesByName(name);
	for(var i = 0; i < nodes.length; ++i)
		nodes[i].setTrigger(func);
}


LGraph.prototype.connectionChange = function( node )
{
	this.updateExecutionOrder();
	if( this.onConnectionChange )
		this.onConnectionChange( node );
	this.sendActionToCanvas("onConnectionChange");
}

/**
* returns if the graph is in live mode
* @method isLive
*/

LGraph.prototype.isLive = function()
{
	if(!this.list_of_graphcanvas)
		return false;

	for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
	{
		var c = this.list_of_graphcanvas[i];
		if(c.live_mode)
			return true;
	}
	return false;
}

/* Called when something visually changed */
LGraph.prototype.change = function()
{
	if(LiteGraph.debug)
		console.log("Graph changed");

	this.sendActionToCanvas("setDirty",[true,true]);

	if(this.on_change)
		this.on_change(this);
}

LGraph.prototype.setDirtyCanvas = function(fg,bg)
{
	this.sendActionToCanvas("setDirty",[fg,bg]);
}

//save and recover app state ***************************************
/**
* Creates a Object containing all the info about this graph, it can be serialized
* @method serialize
* @return {Object} value of the node
*/
LGraph.prototype.serialize = function()
{
	var nodes_info = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		nodes_info.push( this._nodes[i].serialize() );

	//remove data from links, we dont want to store it
	for(var i in this.links) //links is an OBJECT
	{
		var link = this.links[i];
		link.data = null;
		delete link._last_time;
	}

	var data = {
//		graph: this.graph,

		iteration: this.iteration,
		frame: this.frame,
		last_node_id: this.last_node_id,
		last_link_id: this.last_link_id,
		links: LiteGraph.cloneObject( this.links ),

		config: this.config,
		nodes: nodes_info
	};

	return data;
}


/**
* Configure a graph from a JSON string 
* @method configure
* @param {String} str configure a graph from a JSON string
*/
LGraph.prototype.configure = function(data, keep_old)
{
	if(!keep_old)
		this.clear();

	var nodes = data.nodes;

	//copy all stored fields
	for (var i in data)
		this[i] = data[i];

	var error = false;

	//create nodes
	this._nodes = [];
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var n_info = nodes[i]; //stored info
		var node = LiteGraph.createNode( n_info.type, n_info.title );
		if(!node)
		{
			if(LiteGraph.debug)
				console.log("Node not found: " + n_info.type);
			error = true;
			continue;
		}

		node.id = n_info.id; //id it or it will create a new id
		this.add(node, true); //add before configure, otherwise configure cannot create links
	}

	//configure nodes afterwards so they can reach each other
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var n_info = nodes[i];
		var node = this.getNodeById( n_info.id );
		if(node)
			node.configure( n_info );
	}

	this.updateExecutionOrder();
	this.setDirtyCanvas(true,true);
	return error;
}

LGraph.prototype.load = function(url)
{
	var that = this;
	var req = new XMLHttpRequest();
	req.open('GET', url, true); 
	req.send(null);
	req.onload = function (oEvent) {
		if(req.status !== 200)
		{
			console.error("Error loading graph:",req.status,req.response);
			return;
		}
		var data = JSON.parse( req.response );
		that.configure(data);
	}
	req.onerror = function(err)
	{
		console.error("Error loading graph:",err);
	}
}

LGraph.prototype.onNodeTrace = function(node, msg, color)
{
	//TODO
}

// *************************************************************
//   Node CLASS                                          *******
// *************************************************************

/*
	title: string
	pos: [x,y]
	size: [x,y]

	input|output: every connection
		+  { name:string, type:string, pos: [x,y]=Optional, direction: "input"|"output", links: Array });

	flags:
		+ skip_title_render
		+ clip_area
		+ unsafe_execution: not allowed for safe execution

	supported callbacks: 
		+ onAdded: when added to graph
		+ onRemoved: when removed from graph
		+ onStart:	when the graph starts playing
		+ onStop:	when the graph stops playing
		+ onDrawForeground: render the inside widgets inside the node
		+ onDrawBackground: render the background area inside the node (only in edit mode)
		+ onMouseDown
		+ onMouseMove
		+ onMouseUp
		+ onMouseEnter
		+ onMouseLeave
		+ onExecute: execute the node
		+ onPropertyChanged: when a property is changed in the panel (return true to skip default behaviour)
		+ onGetInputs: returns an array of possible inputs
		+ onGetOutputs: returns an array of possible outputs
		+ onDblClick
		+ onSerialize
		+ onSelected
		+ onDeselected
		+ onDropItem : DOM item dropped over the node
		+ onDropFile : file dropped over the node
		+ onConnectInput : if returns false the incoming connection will be canceled
		+ onConnectionsChange : a connection changed (new one or removed)
*/

/**
* Base Class for all the node type classes
* @class LGraphNode
* @param {String} name a name for the node
*/

global.LGraphNode = LiteGraph.LGraphNode = function LGraphNode(title)
{
	this._ctor();
}

LGraphNode.prototype._ctor = function( title )
{
	this.title = title || "Unnamed";
	this.size = [LiteGraph.NODE_WIDTH,60];
	this.graph = null;

	this._pos = new Float32Array(10,10);

	Object.defineProperty( this, "pos", {
		set: function(v)
		{
			if(!v || !v.length < 2)
				return;
			this._pos[0] = v[0];
			this._pos[1] = v[1];
		},
		get: function()
		{
			return this._pos;
		},
		enumerable: true
	});

	this.id = -1; //not know till not added
	this.type = null;

	//inputs available: array of inputs
	this.inputs = [];
	this.outputs = [];
	this.connections = [];

	//local data
	this.properties = {}; //for the values
	this.properties_info = []; //for the info

	this.data = null; //persistent local data
	this.flags = {
		//skip_title_render: true,
		//unsafe_execution: false,
	};
}

/**
* configure a node from an object containing the serialized info
* @method configure
*/
LGraphNode.prototype.configure = function(info)
{
	for (var j in info)
	{
		if(j == "console")
			continue;

		if(j == "properties")
		{
			//i dont want to clone properties, I want to reuse the old container
			for(var k in info.properties)
			{
				this.properties[k] = info.properties[k];
				if(this.onPropertyChanged)
					this.onPropertyChanged(k,info.properties[k]);
			}
			continue;
		}

		if(info[j] == null)
			continue;
		else if (typeof(info[j]) == 'object') //object
		{
			if(this[j] && this[j].configure)
				this[j].configure( info[j] );
			else
				this[j] = LiteGraph.cloneObject(info[j], this[j]);
		}
		else //value
			this[j] = info[j];
	}

	if(this.onConnectionsChange)
	{
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var link_info = this.graph.links[ input.link ];
			this.onConnectionsChange( LiteGraph.INPUT, i, true, link_info ); //link_info has been created now, so its updated
		}

		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			for(var j = 0; j < output.links.length; ++j)
			{
				var link_info = this.graph.links[ output.links[j] ];
				this.onConnectionsChange( LiteGraph.OUTPUT, i, true, link_info ); //link_info has been created now, so its updated
			}
		}
	}

	//FOR LEGACY, PLEASE REMOVE ON NEXT VERSION
	for(var i in this.inputs)
	{
		var input = this.inputs[i];
		if(!input.link || !input.link.length )
			continue;
		var link = input.link;
		if(typeof(link) != "object")
			continue;
		input.link = link[0];
		this.graph.links[ link[0] ] = { id: link[0], origin_id: link[1], origin_slot: link[2], target_id: link[3], target_slot: link[4] };
	}
	for(var i in this.outputs)
	{
		var output = this.outputs[i];
		if(!output.links || output.links.length == 0)
			continue;
		for(var j in output.links)
		{
			var link = output.links[j];
			if(typeof(link) != "object")
				continue;
			output.links[j] = link[0];
		}
	}

	if( this.onConfigure )
		this.onConfigure( info );
}

/**
* serialize the content
* @method serialize
*/

LGraphNode.prototype.serialize = function()
{
	var o = {
		id: this.id,
		title: this.title,
		type: this.type,
		pos: this.pos,
		size: this.size,
		data: this.data,
		flags: LiteGraph.cloneObject(this.flags),
		inputs: this.inputs,
		outputs: this.outputs,
		mode: this.mode
	};

	if(this.properties)
		o.properties = LiteGraph.cloneObject(this.properties);

	if(!o.type)
		o.type = this.constructor.type;

	if(this.color)
		o.color = this.color;
	if(this.bgcolor)
		o.bgcolor = this.bgcolor;
	if(this.boxcolor)
		o.boxcolor = this.boxcolor;
	if(this.shape)
		o.shape = this.shape;

	if(this.onSerialize)
		this.onSerialize(o);

	return o;
}


/* Creates a clone of this node */
LGraphNode.prototype.clone = function()
{
	var node = LiteGraph.createNode(this.type);

	//we clone it because serialize returns shared containers
	var data = LiteGraph.cloneObject( this.serialize() );

	//remove links
	if(data.inputs)
		for(var i = 0; i < data.inputs.length; ++i)
			data.inputs[i].link = null;

	if(data.outputs)
		for(var i = 0; i < data.outputs.length; ++i)
		{
			if(data.outputs[i].links)
				data.outputs[i].links.length = 0;
		}

	delete data["id"];
	//remove links
	node.configure(data);

	return node;
}


/**
* serialize and stringify
* @method toString
*/

LGraphNode.prototype.toString = function()
{
	return JSON.stringify( this.serialize() );
}
//LGraphNode.prototype.unserialize = function(info) {} //this cannot be done from within, must be done in LiteGraph


/**
* get the title string
* @method getTitle
*/

LGraphNode.prototype.getTitle = function()
{
	return this.title || this.constructor.title;
}



// Execution *************************
/**
* sets the output data
* @method setOutputData
* @param {number} slot
* @param {*} data
*/
LGraphNode.prototype.setOutputData = function(slot,data)
{
	if(!this.outputs) 
		return;

	if(slot > -1 && slot < this.outputs.length && this.outputs[slot] && this.outputs[slot].links != null)
	{
		for(var i = 0; i < this.outputs[slot].links.length; i++)
		{
			var link_id = this.outputs[slot].links[i];
			this.graph.links[ link_id ].data = data;
		}
	}
}

/**
* retrieves the input data (data traveling through the connection) from one slot
* @method getInputData
* @param {number} slot
* @param {boolean} force_update if set to true it will force the connected node of this slot to output data into this link
* @return {*} data or if it is not connected returns undefined
*/
LGraphNode.prototype.getInputData = function( slot, force_update )
{
	if(!this.inputs) 
		return; //undefined;

	if(slot >= this.inputs.length || this.inputs[slot].link == null)
		return;

	var link_id = this.inputs[slot].link;
	var link = this.graph.links[ link_id ];

	//used to extract data from the incomming connection
	if(!force_update)
		return link.data;

	var node = this.graph.getNodeById( link.origin_id );
	if(!node)
		return link.data;

	if(node.updateOutputData)
		node.updateOutputData( link.origin_slot );
	else if(node.onExecute)
		node.onExecute();

	return link.data;
}

/**
* tells you if there is a connection in one input slot
* @method isInputConnected
* @param {number} slot
* @return {boolean} 
*/
LGraphNode.prototype.isInputConnected = function(slot)
{
	if(!this.inputs) 
		return false;
	return (slot < this.inputs.length && this.inputs[slot].link != null);
}

/**
* tells you info about an input connection (which node, type, etc)
* @method getInputInfo
* @param {number} slot
* @return {Object} object or null
*/
LGraphNode.prototype.getInputInfo = function(slot)
{
	if(!this.inputs)
		return null;
	if(slot < this.inputs.length)
		return this.inputs[slot];
	return null;
}

/**
* returns the node connected in the input slot
* @method getInputNode
* @param {number} slot
* @return {LGraphNode} node or null
*/
LGraphNode.prototype.getInputNode = function( slot )
{
	if(!this.inputs)
		return null;
	if(slot >= this.inputs.length)
		return null;
	var input = this.inputs[slot];
	if(!input || !input.link)
		return null;
	var link_info = this.graph.links[ input.link ];
	if(!link_info)
		return null;
	return this.graph.getNodeById( link_info.origin_id );
}


/**
* tells you info about an output connection (which node, type, etc)
* @method getOutputInfo
* @param {number} slot
* @return {Object}  object or null
*/
LGraphNode.prototype.getOutputInfo = function(slot)
{
	if(!this.outputs)
		return null;
	if(slot < this.outputs.length)
		return this.outputs[slot];
	return null;
}


/**
* tells you if there is a connection in one output slot
* @method isOutputConnected
* @param {number} slot
* @return {boolean} 
*/
LGraphNode.prototype.isOutputConnected = function(slot)
{
	if(!this.outputs)
		return null;
	return (slot < this.outputs.length && this.outputs[slot].links && this.outputs[slot].links.length);
}

/**
* retrieves all the nodes connected to this output slot
* @method getOutputNodes
* @param {number} slot
* @return {array} 
*/
LGraphNode.prototype.getOutputNodes = function(slot)
{
	if(!this.outputs || this.outputs.length == 0) return null;
	if(slot < this.outputs.length)
	{
		var output = this.outputs[slot];
		var r = [];
		for(var i = 0; i < output.length; i++)
			r.push( this.graph.getNodeById( output.links[i].target_id ));
		return r;
	}
	return null;
}

/**
* Triggers an event in this node, this will trigger any output with the same name
* @method trigger
* @param {String} event name ( "on_play", ... ) if action is equivalent to false then the event is send to all
* @param {*} param
*/
LGraphNode.prototype.trigger = function( action, param )
{
	if( !this.outputs || !this.outputs.length )
		return;

	if(this.graph)
		this.graph._last_trigger_time = LiteGraph.getTime();

	for(var i = 0; i < this.outputs.length; ++i)
	{
		var output = this.outputs[i];
		if(output.type !== LiteGraph.EVENT || (action && output.name != action) )
			continue;

		var links = output.links;
		if(!links || !links.length)
			continue;

		//for every link attached here
		for(var k = 0; k < links.length; ++k)
		{
			var link_info = this.graph.links[ links[k] ];
			if(!link_info) //not connected
				continue;
			var node = this.graph.getNodeById( link_info.target_id );
			if(!node) //node not found?
				continue;

			//used to mark events in graph
			link_info._last_time = LiteGraph.getTime();

			var target_connection = node.inputs[ link_info.target_slot ];

			if(node.onAction)
				node.onAction( target_connection.name, param );
			else if(node.mode === LiteGraph.ON_TRIGGER)
			{
				if(node.onExecute)
					node.onExecute(param);
			}
		}
	}
}

/**
* add a new property to this node
* @method addProperty
* @param {string} name
* @param {*} default_value
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of the property (like values, etc)
*/
LGraphNode.prototype.addProperty = function( name, default_value, type, extra_info )
{
	var o = { name: name, type: type, default_value: default_value };
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];
	if(!this.properties_info)
		this.properties_info = [];
	this.properties_info.push(o);
	if(!this.properties)
		this.properties = {};
	this.properties[ name ] = default_value;
	return o;
}


//connections

/**
* add a new output slot to use in this node
* @method addOutput
* @param {string} name
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of an output (label, special color, position, etc)
*/
LGraphNode.prototype.addOutput = function(name,type,extra_info)
{
	var o = { name: name, type: type, links: null };
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];

	if(!this.outputs)
		this.outputs = [];
	this.outputs.push(o);
	if(this.onOutputAdded)
		this.onOutputAdded(o);
	this.size = this.computeSize();
	return o;
}

/**
* add a new output slot to use in this node
* @method addOutputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addOutputs = function(array)
{
	for(var i = 0; i < array.length; ++i)
	{
		var info = array[i];
		var o = {name:info[0],type:info[1],link:null};
		if(array[2])
			for(var j in info[2])
				o[j] = info[2][j];

		if(!this.outputs)
			this.outputs = [];
		this.outputs.push(o);
		if(this.onOutputAdded)
			this.onOutputAdded(o);
	}

	this.size = this.computeSize();
}

/**
* remove an existing output slot
* @method removeOutput
* @param {number} slot
*/
LGraphNode.prototype.removeOutput = function(slot)
{
	this.disconnectOutput(slot);
	this.outputs.splice(slot,1);
	this.size = this.computeSize();
	if(this.onOutputRemoved)
		this.onOutputRemoved(slot);
}

/**
* add a new input slot to use in this node
* @method addInput
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...), it its a generic one use 0
* @param {Object} extra_info this can be used to have special properties of an input (label, color, position, etc)
*/
LGraphNode.prototype.addInput = function(name,type,extra_info)
{
	type = type || 0;
	var o = {name:name,type:type,link:null};
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];

	if(!this.inputs)
		this.inputs = [];
	this.inputs.push(o);
	this.size = this.computeSize();
	if(this.onInputAdded)
		this.onInputAdded(o);
	return o;
}

/**
* add several new input slots in this node
* @method addInputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addInputs = function(array)
{
	for(var i = 0; i < array.length; ++i)
	{
		var info = array[i];
		var o = {name:info[0], type:info[1], link:null};
		if(array[2])
			for(var j in info[2])
				o[j] = info[2][j];

		if(!this.inputs)
			this.inputs = [];
		this.inputs.push(o);
		if(this.onInputAdded)
			this.onInputAdded(o);
	}

	this.size = this.computeSize();
}

/**
* remove an existing input slot
* @method removeInput
* @param {number} slot
*/
LGraphNode.prototype.removeInput = function(slot)
{
	this.disconnectInput(slot);
	this.inputs.splice(slot,1);
	this.size = this.computeSize();
	if(this.onInputRemoved)
		this.onInputRemoved(slot);
}

/**
* add an special connection to this node (used for special kinds of graphs)
* @method addConnection
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...)
* @param {[x,y]} pos position of the connection inside the node
* @param {string} direction if is input or output
*/
LGraphNode.prototype.addConnection = function(name,type,pos,direction)
{
	var o = { 
		name: name,
		type: type,
		pos: pos,
		direction: direction,
		links: null
	};
	this.connections.push( o );
	return o;
}

/**
* computes the size of a node according to its inputs and output slots
* @method computeSize
* @param {number} minHeight
* @return {number} the total size
*/
LGraphNode.prototype.computeSize = function( minHeight, out )
{
	var rows = Math.max( this.inputs ? this.inputs.length : 1, this.outputs ? this.outputs.length : 1);
	var size = out || new Float32Array([0,0]);
	rows = Math.max(rows, 1);
	size[1] = rows * 14 + 6;

	var font_size = 14;
	var title_width = compute_text_size( this.title );
	var input_width = 0;
	var output_width = 0;

	if(this.inputs)
		for(var i = 0, l = this.inputs.length; i < l; ++i)
		{
			var input = this.inputs[i];
			var text = input.label || input.name || "";
			var text_width = compute_text_size( text );
			if(input_width < text_width)
				input_width = text_width;
		}

	if(this.outputs)
		for(var i = 0, l = this.outputs.length; i < l; ++i)
		{
			var output = this.outputs[i];
			var text = output.label || output.name || "";
			var text_width = compute_text_size( text );
			if(output_width < text_width)
				output_width = text_width;
		}

	size[0] = Math.max( input_width + output_width + 10, title_width );
	size[0] = Math.max( size[0], LiteGraph.NODE_WIDTH );

	function compute_text_size( text )
	{
		if(!text)
			return 0;
		return font_size * text.length * 0.6;
	}

	return size;
}

/**
* returns the bounding of the object, used for rendering purposes
* @method getBounding
* @return {Float32Array[4]} the total size
*/
LGraphNode.prototype.getBounding = function()
{
	return new Float32Array([this.pos[0] - 4, this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT, this.pos[0] + this.size[0] + 4, this.pos[1] + this.size[1] + LGraph.NODE_TITLE_HEIGHT]);
}

/**
* checks if a point is inside the shape of a node
* @method isPointInsideNode
* @param {number} x
* @param {number} y
* @return {boolean} 
*/
LGraphNode.prototype.isPointInsideNode = function(x,y, margin)
{
	margin = margin || 0;

	var margin_top = this.graph && this.graph.isLive() ? 0 : 20;
	if(this.flags.collapsed)
	{
		//if ( distance([x,y], [this.pos[0] + this.size[0]*0.5, this.pos[1] + this.size[1]*0.5]) < LiteGraph.NODE_COLLAPSED_RADIUS)
		if( isInsideRectangle( x, y, this.pos[0] - margin, this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT - margin, LiteGraph.NODE_COLLAPSED_WIDTH + 2 * margin, LiteGraph.NODE_TITLE_HEIGHT + 2 * margin ) )
			return true;
	}
	else if ( (this.pos[0] - 4 - margin) < x && (this.pos[0] + this.size[0] + 4 + margin) > x
		&& (this.pos[1] - margin_top - margin) < y && (this.pos[1] + this.size[1] + margin) > y)
		return true;
	return false;
}

/**
* checks if a point is inside a node slot, and returns info about which slot
* @method getSlotInPosition
* @param {number} x
* @param {number} y
* @return {Object} if found the object contains { input|output: slot object, slot: number, link_pos: [x,y] }
*/
LGraphNode.prototype.getSlotInPosition = function( x, y )
{
	//search for inputs
	if(this.inputs)
		for(var i = 0, l = this.inputs.length; i < l; ++i)
		{
			var input = this.inputs[i];
			var link_pos = this.getConnectionPos( true,i );
			if( isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
				return { input: input, slot: i, link_pos: link_pos, locked: input.locked };
		}

	if(this.outputs)
		for(var i = 0, l = this.outputs.length; i < l; ++i)
		{
			var output = this.outputs[i];
			var link_pos = this.getConnectionPos(false,i);
			if( isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
				return { output: output, slot: i, link_pos: link_pos, locked: output.locked };
		}

	return null;
}

/**
* returns the input slot with a given name (used for dynamic slots), -1 if not found
* @method findInputSlot
* @param {string} name the name of the slot 
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findInputSlot = function(name)
{
	if(!this.inputs) return -1;
	for(var i = 0, l = this.inputs.length; i < l; ++i)
		if(name == this.inputs[i].name)
			return i;
	return -1;
}

/**
* returns the output slot with a given name (used for dynamic slots), -1 if not found
* @method findOutputSlot
* @param {string} name the name of the slot 
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findOutputSlot = function(name)
{
	if(!this.outputs) return -1;
	for(var i = 0, l = this.outputs.length; i < l; ++i)
		if(name == this.outputs[i].name)
			return i;
	return -1;
}

/**
* connect this node output to the input of another node
* @method connect
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} node the target node 
* @param {number_or_string} target_slot the input slot of the target node (could be the number of the slot or the string with the name of the slot, or -1 to connect a trigger)
* @return {boolean} if it was connected succesfully
*/
LGraphNode.prototype.connect = function( slot, target_node, target_slot )
{
	target_slot = target_slot || 0;

	//seek for the output slot
	if( slot.constructor === String )
	{
		slot = this.findOutputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return false;
		}
	}
	else if(!this.outputs || slot >= this.outputs.length) 
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	if(target_node && target_node.constructor === Number)
		target_node = this.graph.getNodeById( target_node );
	if(!target_node)
		throw("Node not found");

	//avoid loopback
	if(target_node == this)
		return false; 

	//you can specify the slot by name
	if(target_slot.constructor === String)
	{
		target_slot = target_node.findInputSlot( target_slot );
		if(target_slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + target_slot);
			return false;
		}
	}
	else if( target_slot === LiteGraph.EVENT )
	{
		//search for first slot with event?
		/*
		//create input for trigger
		var input = target_node.addInput("onTrigger", LiteGraph.EVENT );
		target_slot = target_node.inputs.length - 1; //last one is the one created
		target_node.mode = LiteGraph.ON_TRIGGER;
		*/
		return false;
	}
	else if( !target_node.inputs || target_slot >= target_node.inputs.length ) 
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	//if there is something already plugged there, disconnect
	if(target_node.inputs[ target_slot ].link != null )
		target_node.disconnectInput( target_slot );

	//why here??
	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );
		
	var output = this.outputs[slot];

	//allows nodes to block connection 
	if(target_node.onConnectInput)
		if( target_node.onConnectInput( target_slot, output.type, output ) === false)
			return false;

	var input = target_node.inputs[target_slot];

	if( LiteGraph.isValidConnection( output.type, input.type) )
	{
		var link_info = { 
			id: this.graph.last_link_id++, 
			origin_id: this.id, 
			origin_slot: slot, 
			target_id: target_node.id, 
			target_slot: target_slot
		};

		//add to graph links list
		this.graph.links[ link_info.id ] = link_info;

		//connect in output
		if( output.links == null )
			output.links = [];
		output.links.push( link_info.id );
		//connect in input
		target_node.inputs[target_slot].link = link_info.id;

		if(this.onConnectionsChange)
			this.onConnectionsChange( LiteGraph.OUTPUT, slot, true, link_info ); //link_info has been created now, so its updated
		if(target_node.onConnectionsChange)
			target_node.onConnectionsChange( LiteGraph.INPUT, target_slot, true, link_info );
	}

	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );

	return true;
}

/**
* disconnect one output to an specific node
* @method disconnectOutput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} target_node the target node to which this slot is connected [Optional, if not target_node is specified all nodes will be disconnected]
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectOutput = function( slot, target_node )
{
	if( slot.constructor === String )
	{
		slot = this.findOutputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return false;
		}
	}
	else if(!this.outputs || slot >= this.outputs.length) 
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	//get output slot
	var output = this.outputs[slot];
	if(!output.links || output.links.length == 0)
		return false;

	//one of the links
	if(target_node)
	{
		if(target_node.constructor === Number)
			target_node = this.graph.getNodeById( target_node );
		if(!target_node)
			throw("Target Node not found");

		for(var i = 0, l = output.links.length; i < l; i++)
		{
			var link_id = output.links[i];
			var link_info = this.graph.links[ link_id ];

			//is the link we are searching for...
			if( link_info.target_id == target_node.id )
			{
				output.links.splice(i,1); //remove here
				target_node.inputs[ link_info.target_slot ].link = null; //remove there
				delete this.graph.links[ link_id ]; //remove the link from the links pool
				if(target_node.onConnectionsChange)
					target_node.onConnectionsChange( LiteGraph.INPUT, link_info.target_slot, false, link_info ); //link_info hasnt been modified so its ok
				if(this.onConnectionsChange)
					this.onConnectionsChange( LiteGraph.OUTPUT, slot, false, link_info );
				break;
			}
		}
	}
	else //all the links
	{
		for(var i = 0, l = output.links.length; i < l; i++)
		{
			var link_id = output.links[i];
			var link_info = this.graph.links[ link_id ];

			var target_node = this.graph.getNodeById( link_info.target_id );
			if(target_node)
				target_node.inputs[ link_info.target_slot ].link = null; //remove other side link
			delete this.graph.links[ link_id ]; //remove the link from the links pool
			if(target_node.onConnectionsChange)
				target_node.onConnectionsChange( LiteGraph.INPUT, link_info.target_slot, false, link_info ); //link_info hasnt been modified so its ok
			if(this.onConnectionsChange)
				this.onConnectionsChange( LiteGraph.OUTPUT, slot, false, link_info );
		}
		output.links = null;
	}


	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );
	return true;
}

/**
* disconnect one input
* @method disconnectInput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectInput = function( slot )
{
	//seek for the output slot
	if( slot.constructor === String )
	{
		slot = this.findInputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return false;
		}
	}
	else if(!this.inputs || slot >= this.inputs.length) 
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	var input = this.inputs[slot];
	if(!input)
		return false;

	var link_id = this.inputs[slot].link;
	this.inputs[slot].link = null;

	//remove other side
	var link_info = this.graph.links[ link_id ];
	if( link_info )
	{
		var target_node = this.graph.getNodeById( link_info.origin_id );
		if(!target_node)
			return false;

		var output = target_node.outputs[ link_info.origin_slot ];
		if(!output || !output.links || output.links.length == 0) 
			return false;

		//search in the inputs list for this link
		for(var i = 0, l = output.links.length; i < l; i++)
		{
			var link_id = output.links[i];
			var link_info = this.graph.links[ link_id ];
			if( link_info.target_id == this.id )
			{
				output.links.splice(i,1);
				break;
			}
		}

		if( this.onConnectionsChange )
			this.onConnectionsChange( LiteGraph.INPUT, slot, false, link_info );
		if( target_node.onConnectionsChange )
			target_node.onConnectionsChange( LiteGraph.OUTPUT, i, false, link_info );
	}

	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );
	return true;
}

/**
* returns the center of a connection point in canvas coords
* @method getConnectionPos
* @param {boolean} is_input true if if a input slot, false if it is an output
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @return {[x,y]} the position
**/
LGraphNode.prototype.getConnectionPos = function(is_input, slot_number)
{
	if(this.flags.collapsed)
	{
		if(is_input)
			return [this.pos[0], this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5];
		else
			return [this.pos[0] + LiteGraph.NODE_COLLAPSED_WIDTH, this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5];
		//return [this.pos[0] + this.size[0] * 0.5, this.pos[1] + this.size[1] * 0.5];
	}

	if(is_input && slot_number == -1)
	{
		return [this.pos[0] + 10, this.pos[1] + 10];
	}

	if(is_input && this.inputs.length > slot_number && this.inputs[slot_number].pos)
		return [this.pos[0] + this.inputs[slot_number].pos[0],this.pos[1] + this.inputs[slot_number].pos[1]];
	else if(!is_input && this.outputs.length > slot_number && this.outputs[slot_number].pos)
		return [this.pos[0] + this.outputs[slot_number].pos[0],this.pos[1] + this.outputs[slot_number].pos[1]];

	if(!is_input) //output
		return [this.pos[0] + this.size[0] + 1, this.pos[1] + 10 + slot_number * LiteGraph.NODE_SLOT_HEIGHT];
	return [this.pos[0] , this.pos[1] + 10 + slot_number * LiteGraph.NODE_SLOT_HEIGHT];
}

/* Force align to grid */
LGraphNode.prototype.alignToGrid = function()
{
	this.pos[0] = LiteGraph.CANVAS_GRID_SIZE * Math.round(this.pos[0] / LiteGraph.CANVAS_GRID_SIZE);
	this.pos[1] = LiteGraph.CANVAS_GRID_SIZE * Math.round(this.pos[1] / LiteGraph.CANVAS_GRID_SIZE);
}


/* Console output */
LGraphNode.prototype.trace = function(msg)
{
	if(!this.console)
		this.console = [];
	this.console.push(msg);
	if(this.console.length > LGraphNode.MAX_CONSOLE)
		this.console.shift();

	this.graph.onNodeTrace(this,msg);
}

/* Forces to redraw or the main canvas (LGraphNode) or the bg canvas (links) */
LGraphNode.prototype.setDirtyCanvas = function(dirty_foreground, dirty_background)
{
	if(!this.graph)
		return;
	this.graph.sendActionToCanvas("setDirty",[dirty_foreground, dirty_background]);
}

LGraphNode.prototype.loadImage = function(url)
{
	var img = new Image();
	img.src = LiteGraph.node_images_path + url;	
	img.ready = false;

	var that = this;
	img.onload = function() { 
		this.ready = true;
		that.setDirtyCanvas(true);
	}
	return img;
}

//safe LGraphNode action execution (not sure if safe)
/*
LGraphNode.prototype.executeAction = function(action)
{
	if(action == "") return false;

	if( action.indexOf(";") != -1 || action.indexOf("}") != -1)
	{
		this.trace("Error: Action contains unsafe characters");
		return false;
	}

	var tokens = action.split("(");
	var func_name = tokens[0];
	if( typeof(this[func_name]) != "function")
	{
		this.trace("Error: Action not found on node: " + func_name);
		return false;
	}

	var code = action;

	try
	{
		var _foo = eval;
		eval = null;
		(new Function("with(this) { " + code + "}")).call(this);
		eval = _foo;
	}
	catch (err)
	{
		this.trace("Error executing action {" + action + "} :" + err);
		return false;
	}

	return true;
}
*/

/* Allows to get onMouseMove and onMouseUp events even if the mouse is out of focus */
LGraphNode.prototype.captureInput = function(v)
{
	if(!this.graph || !this.graph.list_of_graphcanvas)
		return;

	var list = this.graph.list_of_graphcanvas;

	for(var i = 0; i < list.length; ++i)
	{
		var c = list[i];
		//releasing somebody elses capture?!
		if(!v && c.node_capturing_input != this)
			continue;

		//change
		c.node_capturing_input = v ? this : null;
	}
}

/**
* Collapse the node to make it smaller on the canvas
* @method collapse
**/
LGraphNode.prototype.collapse = function()
{
	if(!this.flags.collapsed)
		this.flags.collapsed = true;
	else
		this.flags.collapsed = false;
	this.setDirtyCanvas(true,true);
}

/**
* Forces the node to do not move or realign on Z
* @method pin
**/

LGraphNode.prototype.pin = function(v)
{
	if(v === undefined)
		this.flags.pinned = !this.flags.pinned;
	else
		this.flags.pinned = v;
}

LGraphNode.prototype.localToScreen = function(x,y, graphcanvas)
{
	return [(x + this.pos[0]) * graphcanvas.scale + graphcanvas.offset[0],
		(y + this.pos[1]) * graphcanvas.scale + graphcanvas.offset[1]];
}



//*********************************************************************************
// LGraphCanvas: LGraph renderer CLASS                                  
//*********************************************************************************

/**
* The Global Scope. It contains all the registered node classes.
* Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
*
* @class LGraphCanvas
* @constructor
* @param {HTMLCanvas} canvas the canvas where you want to render (it accepts a selector in string format or the canvas itself)
* @param {LGraph} graph [optional]
* @param {Object} options [optional] { skip_rendering, autoresize }
*/
global.LGraphCanvas = LiteGraph.LGraphCanvas = function LGraphCanvas( canvas, graph, options )
{
	options = options || {};

	//if(graph === undefined)
	//	throw ("No graph assigned");

	if(canvas && canvas.constructor === String )
		canvas = document.querySelector( canvas );

	this.max_zoom = 10;
	this.min_zoom = 0.1;

	this.title_text_font = "bold 14px Arial";
	this.inner_text_font = "normal 12px Arial";
	this.default_link_color = "#AAC";

	this.highquality_render = true;
	this.editor_alpha = 1; //used for transition
	this.pause_rendering = false;
	this.render_shadows = true;
	this.clear_background = true;

	this.render_only_selected = true;
	this.live_mode = false;
	this.show_info = true;
	this.allow_dragcanvas = true;
	this.allow_dragnodes = true;
	this.allow_interaction = true; //allow to control widgets, buttons, collapse, etc

	this.always_render_background = false; 
	this.render_connections_shadows = false; //too much cpu
	this.render_connections_border = true;
	this.render_curved_connections = true;
	this.render_connection_arrows = true;

	this.connections_width = 4;

	//link canvas and graph
	if(graph)
		graph.attachCanvas(this);

	this.setCanvas( canvas );
	this.clear();

	if(!options.skip_render)
		this.startRendering();

	this.autoresize = options.autoresize;
}

LGraphCanvas.link_type_colors = {"-1":"#F85",'number':"#AAC","node":"#DCA"};


/**
* clears all the data inside
*
* @method clear
*/
LGraphCanvas.prototype.clear = function()
{
	this.frame = 0;
	this.last_draw_time = 0;
	this.render_time = 0;
	this.fps = 0;

	this.scale = 1;
	this.offset = [0,0];

	this.selected_nodes = {};
	this.node_dragged = null;
	this.node_over = null;
	this.node_capturing_input = null;
	this.connecting_node = null;

	this.dirty_canvas = true;
	this.dirty_bgcanvas = true;
	this.dirty_area = null;

	this.node_in_panel = null;

	this.last_mouse = [0,0];
	this.last_mouseclick = 0;

	if(this.onClear)
		this.onClear();
	//this.UIinit();
}

/**
* assigns a graph, you can reasign graphs to the same canvas
*
* @method setGraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.setGraph = function( graph, skip_clear )
{
	if(this.graph == graph)
		return;

	if(!skip_clear)
		this.clear();

	if(!graph && this.graph)
	{
		this.graph.detachCanvas(this);
		return;
	}

	/*
	if(this.graph)
		this.graph.canvas = null; //remove old graph link to the canvas
	this.graph = graph;
	if(this.graph)
		this.graph.canvas = this;
	*/
	graph.attachCanvas(this);
	this.setDirty(true,true);
}

/**
* opens a graph contained inside a node in the current graph
*
* @method openSubgraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.openSubgraph = function(graph)
{
	if(!graph) 
		throw("graph cannot be null");

	if(this.graph == graph)
		throw("graph cannot be the same");

	this.clear();

	if(this.graph)
	{
		if(!this._graph_stack)
			this._graph_stack = [];
		this._graph_stack.push(this.graph);
	}

	graph.attachCanvas(this);
	this.setDirty(true,true);
}

/**
* closes a subgraph contained inside a node 
*
* @method closeSubgraph
* @param {LGraph} assigns a graph
*/
LGraphCanvas.prototype.closeSubgraph = function()
{
	if(!this._graph_stack || this._graph_stack.length == 0)
		return;
	var graph = this._graph_stack.pop();
	graph.attachCanvas(this);
	this.setDirty(true,true);
}

/**
* assigns a canvas
*
* @method setCanvas
* @param {Canvas} assigns a canvas
*/
LGraphCanvas.prototype.setCanvas = function( canvas, skip_events )
{
	var that = this;

	if(canvas)
	{
		if( canvas.constructor === String )
		{
			canvas = document.getElementById(canvas);
			if(!canvas)
				throw("Error creating LiteGraph canvas: Canvas not found");
		}		
	}

	if(canvas === this.canvas)
		return;

	if(!canvas && this.canvas)
	{
		//maybe detach events from old_canvas
		if(!skip_events)
			this.unbindEvents();
	}

	this.canvas = canvas;

	if(!canvas)
		return;

	//this.canvas.tabindex = "1000";
	canvas.className += " lgraphcanvas";
	canvas.data = this;

	//bg canvas: used for non changing stuff
	this.bgcanvas = null;
	if(!this.bgcanvas)
	{
		this.bgcanvas = document.createElement("canvas");
		this.bgcanvas.width = this.canvas.width;
		this.bgcanvas.height = this.canvas.height;
	}

	if(canvas.getContext == null)
	{
		throw("This browser doesnt support Canvas");
	}

	var ctx = this.ctx = canvas.getContext("2d");
	if(ctx == null)
	{
		console.warn("This canvas seems to be WebGL, enabling WebGL renderer");
		this.enableWebGL();
	}

	//input:  (move and up could be unbinded)
	this._mousemove_callback = this.processMouseMove.bind(this);
	this._mouseup_callback = this.processMouseUp.bind(this);

	if(!skip_events)
		this.bindEvents();
}

//used in some events to capture them
LGraphCanvas.prototype._doNothing = function doNothing(e) { e.preventDefault(); return false; };
LGraphCanvas.prototype._doReturnTrue = function doNothing(e) { e.preventDefault(); return true; };

LGraphCanvas.prototype.bindEvents = function()
{
	if(	this._events_binded )
	{
		console.warn("LGraphCanvas: events already binded");
		return;
	}

	var canvas = this.canvas;

	this._mousedown_callback = this.processMouseDown.bind(this);
	this._mousewheel_callback = this.processMouseWheel.bind(this);

	canvas.addEventListener("mousedown", this._mousedown_callback, true ); //down do not need to store the binded
	canvas.addEventListener("mousemove", this._mousemove_callback );
	canvas.addEventListener("mousewheel", this._mousewheel_callback, false);

	canvas.addEventListener("contextmenu", this._doNothing );
	canvas.addEventListener("DOMMouseScroll", this._mousewheel_callback, false);

	//touch events
	//if( 'touchstart' in document.documentElement )
	{
		canvas.addEventListener("touchstart", this.touchHandler, true);
		canvas.addEventListener("touchmove", this.touchHandler, true);
		canvas.addEventListener("touchend", this.touchHandler, true);
		canvas.addEventListener("touchcancel", this.touchHandler, true);    
	}

	//Keyboard ******************
	this._key_callback = this.processKey.bind(this);

	canvas.addEventListener("keydown", this._key_callback );
	canvas.addEventListener("keyup", this._key_callback );

	//Droping Stuff over nodes ************************************
	this._ondrop_callback = this.processDrop.bind(this);

	canvas.addEventListener("dragover", this._doNothing, false );
	canvas.addEventListener("dragend", this._doNothing, false );
	canvas.addEventListener("drop", this._ondrop_callback, false );
	canvas.addEventListener("dragenter", this._doReturnTrue, false );

	this._events_binded = true;
}

LGraphCanvas.prototype.unbindEvents = function()
{
	if(	!this._events_binded )
	{
		console.warn("LGraphCanvas: no events binded");
		return;
	}

	this.canvas.removeEventListener( "mousedown", this._mousedown_callback );
	this.canvas.removeEventListener( "mousewheel", this._mousewheel_callback );
	this.canvas.removeEventListener( "DOMMouseScroll", this._mousewheel_callback );
	this.canvas.removeEventListener( "keydown", this._key_callback );
	this.canvas.removeEventListener( "keyup", this._key_callback );
	this.canvas.removeEventListener( "contextmenu", this._doNothing );
	this.canvas.removeEventListener( "drop", this._ondrop_callback );
	this.canvas.removeEventListener( "dragenter", this._doReturnTrue );

	this.canvas.removeEventListener("touchstart", this.touchHandler );
	this.canvas.removeEventListener("touchmove", this.touchHandler );
	this.canvas.removeEventListener("touchend", this.touchHandler );
	this.canvas.removeEventListener("touchcancel", this.touchHandler );

	this._mousedown_callback = null;
	this._mousewheel_callback = null;
	this._key_callback = null;
	this._ondrop_callback = null;

	this._events_binded = false;
}

LGraphCanvas.getFileExtension = function (url)
{
	var question = url.indexOf("?");
	if(question != -1)
		url = url.substr(0,question);
	var point = url.lastIndexOf(".");
	if(point == -1) 
		return "";
	return url.substr(point+1).toLowerCase();
} 

//this file allows to render the canvas using WebGL instead of Canvas2D
//this is useful if you plant to render 3D objects inside your nodes
LGraphCanvas.prototype.enableWebGL = function()
{
	if(typeof(GL) === undefined)
		throw("litegl.js must be included to use a WebGL canvas");
	if(typeof(enableWebGLCanvas) === undefined)
		throw("webglCanvas.js must be included to use this feature");

	this.gl = this.ctx = enableWebGLCanvas(this.canvas);
	this.ctx.webgl = true;
	this.bgcanvas = this.canvas;
	this.bgctx = this.gl;

	/*
	GL.create({ canvas: this.bgcanvas });
	this.bgctx = enableWebGLCanvas( this.bgcanvas );
	window.gl = this.gl;
	*/
}


/*
LGraphCanvas.prototype.UIinit = function()
{
	var that = this;
	$("#node-console input").change(function(e)
	{
		if(e.target.value == "")
			return;

		var node = that.node_in_panel;
		if(!node)
			return;
			
		node.trace("] " + e.target.value, "#333");
		if(node.onConsoleCommand)
		{
			if(!node.onConsoleCommand(e.target.value))
				node.trace("command not found", "#A33");
		}
		else if (e.target.value == "info")
		{
			node.trace("Special methods:");
			for(var i in node)
			{
				if(typeof(node[i]) == "function" && LGraphNode.prototype[i] == null && i.substr(0,2) != "on" && i[0] != "_")
					node.trace(" + " + i);
			}
		}
		else
		{
			try
			{
				eval("var _foo = function() { return ("+e.target.value+"); }");
				var result = _foo.call(node);
				if(result)
					node.trace(result.toString());
				delete window._foo;
			}
			catch(err)
			{
				node.trace("error: " + err, "#A33");
			}
		}
		
		this.value = "";
	});
}
*/

/**
* marks as dirty the canvas, this way it will be rendered again 
*
* @class LGraphCanvas
* @method setDirty
* @param {bool} fgcanvas if the foreground canvas is dirty (the one containing the nodes)
* @param {bool} bgcanvas if the background canvas is dirty (the one containing the wires)
*/
LGraphCanvas.prototype.setDirty = function(fgcanvas,bgcanvas)
{
	if(fgcanvas)
		this.dirty_canvas = true;
	if(bgcanvas)
		this.dirty_bgcanvas = true;
}

/**
* Used to attach the canvas in a popup
*
* @method getCanvasWindow
* @return {window} returns the window where the canvas is attached (the DOM root node)
*/
LGraphCanvas.prototype.getCanvasWindow = function()
{
	if(!this.canvas)
		return window;
	var doc = this.canvas.ownerDocument;
	return doc.defaultView || doc.parentWindow;
}

/**
* starts rendering the content of the canvas when needed
*
* @method startRendering
*/
LGraphCanvas.prototype.startRendering = function()
{
	if(this.is_rendering) return; //already rendering

	this.is_rendering = true;
	renderFrame.call(this);

	function renderFrame()
	{
		if(!this.pause_rendering)
			this.draw();

		var window = this.getCanvasWindow();
		if(this.is_rendering)
			window.requestAnimationFrame( renderFrame.bind(this) );
	}
}

/**
* stops rendering the content of the canvas (to save resources)
*
* @method stopRendering
*/
LGraphCanvas.prototype.stopRendering = function()
{
	this.is_rendering = false;
	/*
	if(this.rendering_timer_id)
	{
		clearInterval(this.rendering_timer_id);
		this.rendering_timer_id = null;
	}
	*/
}

/* LiteGraphCanvas input */

LGraphCanvas.prototype.processMouseDown = function(e)
{
	if(!this.graph)
		return;

	this.adjustMouseEvent(e);
	
	var ref_window = this.getCanvasWindow();
	var document = ref_window.document;

	//move mouse move event to the window in case it drags outside of the canvas
	this.canvas.removeEventListener("mousemove", this._mousemove_callback );
	ref_window.document.addEventListener("mousemove", this._mousemove_callback, true ); //catch for the entire window
	ref_window.document.addEventListener("mouseup", this._mouseup_callback, true );

	var n = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes );
	var skip_dragging = false;
    
    LiteGraph.closeAllContextMenus( ref_window );

	if(e.which == 1) //left button mouse
	{
		if(!e.shiftKey) //REFACTOR: integrate with function
		{
            //no node or another node selected
            if (!n || !this.selected_nodes[n.id]) {

                var todeselect = [];
                for (var i in this.selected_nodes)
                    if (this.selected_nodes[i] != n)
                        todeselect.push(this.selected_nodes[i]);
                //two passes to avoid problems modifying the container
                for (var i in todeselect)
                    this.processNodeDeselected(todeselect[i]);
            }
		}
		var clicking_canvas_bg = false;

		//when clicked on top of a node
		//and it is not interactive
		if(n && this.allow_interaction ) 
		{
			if(!this.live_mode && !n.flags.pinned)
				this.bringToFront(n); //if it wasnt selected?
			var skip_action = false;

			//not dragging mouse to connect two slots
			if(!this.connecting_node && !n.flags.collapsed && !this.live_mode)
			{
				//search for outputs
				if(n.outputs)
					for(var i = 0, l = n.outputs.length; i < l; ++i)
					{
						var output = n.outputs[i];
						var link_pos = n.getConnectionPos(false,i);
						if( isInsideRectangle(e.canvasX, e.canvasY, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
						{
							this.connecting_node = n;
							this.connecting_output = output;
							this.connecting_pos = n.getConnectionPos(false,i);
							this.connecting_slot = i;

							skip_action = true;
							break;
						}
					}

				//search for inputs
				if(n.inputs)
					for(var i = 0, l = n.inputs.length; i < l; ++i)
					{
						var input = n.inputs[i];
						var link_pos = n.getConnectionPos(true,i);
						if( isInsideRectangle(e.canvasX, e.canvasY, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
						{
							if(input.link !== null)
							{
								n.disconnectInput(i);
								this.dirty_bgcanvas = true;
								skip_action = true;
							}
						}
					}

				//Search for corner
				if( !skip_action && isInsideRectangle(e.canvasX, e.canvasY, n.pos[0] + n.size[0] - 5, n.pos[1] + n.size[1] - 5 ,5,5 ))
				{
					this.resizing_node = n;
					this.canvas.style.cursor = "se-resize";
					skip_action = true;
				}
			}

			//Search for corner
			if( !skip_action && isInsideRectangle(e.canvasX, e.canvasY, n.pos[0], n.pos[1] - LiteGraph.NODE_TITLE_HEIGHT ,LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT ))
			{
				n.collapse();
				skip_action = true;
			}

			//it wasnt clicked on the links boxes
			if(!skip_action) 
			{
				var block_drag_node = false;

				//double clicking
				var now = LiteGraph.getTime();
				if ((now - this.last_mouseclick) < 300 && this.selected_nodes[n.id])
				{
					//double click node
					if( n.onDblClick)
						n.onDblClick(e);
					this.processNodeDblClicked(n);
					block_drag_node = true;
				}

				//if do not capture mouse

				if( n.onMouseDown && n.onMouseDown(e, [e.canvasX - n.pos[0], e.canvasY - n.pos[1]] ) )
					block_drag_node = true;
				else if(this.live_mode)
				{
					clicking_canvas_bg = true;
					block_drag_node = true;
				}
				
				if(!block_drag_node)
				{
					if(this.allow_dragnodes)
						this.node_dragged = n;

					if(!this.selected_nodes[n.id])
						this.processNodeSelected(n,e);
				}

				this.dirty_canvas = true;
			}
		}
		else
			clicking_canvas_bg = true;

		if(clicking_canvas_bg && this.allow_dragcanvas)
		{
			this.dragging_canvas = true;
		}
	}
	else if (e.which == 2) //middle button
	{

	}
	else if (e.which == 3) //right button
	{
		this.processContextMenu(n,e);
	}

	//TODO
	//if(this.node_selected != prev_selected)
	//	this.onNodeSelectionChange(this.node_selected);

	this.last_mouse[0] = e.localX;
	this.last_mouse[1] = e.localY;
	this.last_mouseclick = LiteGraph.getTime();
	this.canvas_mouse = [e.canvasX, e.canvasY];

	/*
	if( (this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null) 
		this.draw();
	*/

	this.graph.change();

	//this is to ensure to defocus(blur) if a text input element is on focus
	if(!ref_window.document.activeElement || (ref_window.document.activeElement.nodeName.toLowerCase() != "input" && ref_window.document.activeElement.nodeName.toLowerCase() != "textarea"))
		e.preventDefault();
	e.stopPropagation();

	if(this.onMouseDown)
		this.onMouseDown(e);

	return false;
}

LGraphCanvas.prototype.processMouseMove = function(e)
{
	if(this.autoresize)
		this.resize();

	if(!this.graph)
		return;

	this.adjustMouseEvent(e);
	var mouse = [e.localX, e.localY];
	var delta = [mouse[0] - this.last_mouse[0], mouse[1] - this.last_mouse[1]];
	this.last_mouse = mouse;
	this.canvas_mouse = [e.canvasX, e.canvasY];

	if(this.dragging_canvas)
	{
		this.offset[0] += delta[0] / this.scale;
		this.offset[1] += delta[1] / this.scale;
		this.dirty_canvas = true;
		this.dirty_bgcanvas = true;
	}
	else if(this.allow_interaction)
	{
		if(this.connecting_node)
			this.dirty_canvas = true;

		//get node over
		var n = this.graph.getNodeOnPos(e.canvasX, e.canvasY, this.visible_nodes);

		//remove mouseover flag
		for(var i = 0, l = this.graph._nodes.length; i < l; ++i)
		{
			if(this.graph._nodes[i].mouseOver && n != this.graph._nodes[i])
			{
				//mouse leave
				this.graph._nodes[i].mouseOver = false;
				if(this.node_over && this.node_over.onMouseLeave)
					this.node_over.onMouseLeave(e);
				this.node_over = null;
				this.dirty_canvas = true;
			}
		}

		//mouse over a node
		if(n)
		{
			//this.canvas.style.cursor = "move";
			if(!n.mouseOver)
			{
				//mouse enter
				n.mouseOver = true;
				this.node_over = n;
				this.dirty_canvas = true;

				if(n.onMouseEnter) n.onMouseEnter(e);
			}

			if(n.onMouseMove) n.onMouseMove(e);

			//on top of input
			if(this.connecting_node)
			{
				var pos = this._highlight_input || [0,0]; //to store the output of isOverNodeInput
				
				if( this.isOverNodeBox( n, e.canvasX, e.canvasY ) )
				{
					//mouse on top of the corner box, dont know what to do
				}
				else
				{
					var slot = this.isOverNodeInput( n, e.canvasX, e.canvasY, pos );
					if(slot != -1 && n.inputs[slot])
					{	
						var slot_type = n.inputs[slot].type;
						if( LiteGraph.isValidConnection( this.connecting_output.type, slot_type ) )
							this._highlight_input = pos;
					}
					else
						this._highlight_input = null;
				}
			}

			//Search for corner
			if( isInsideRectangle(e.canvasX, e.canvasY, n.pos[0] + n.size[0] - 5, n.pos[1] + n.size[1] - 5 ,5,5 ))
				this.canvas.style.cursor = "se-resize";
			else
				this.canvas.style.cursor = null;
		}
		else
			this.canvas.style.cursor = null;

		if(this.node_capturing_input && this.node_capturing_input != n && this.node_capturing_input.onMouseMove)
		{
			this.node_capturing_input.onMouseMove(e);
		}


		if(this.node_dragged && !this.live_mode)
		{
			/*
			this.node_dragged.pos[0] += delta[0] / this.scale;
			this.node_dragged.pos[1] += delta[1] / this.scale;
			this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
			this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
			*/
			
			for(var i in this.selected_nodes)
			{
				var n = this.selected_nodes[i];
				
				n.pos[0] += delta[0] / this.scale;
				n.pos[1] += delta[1] / this.scale;
				//n.pos[0] = Math.round(n.pos[0]);
				//n.pos[1] = Math.round(n.pos[1]);
			}
			
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
		}

		if(this.resizing_node && !this.live_mode)
		{
			this.resizing_node.size[0] += delta[0] / this.scale;
			this.resizing_node.size[1] += delta[1] / this.scale;
			var max_slots = Math.max( this.resizing_node.inputs ? this.resizing_node.inputs.length : 0, this.resizing_node.outputs ? this.resizing_node.outputs.length : 0);
			if(this.resizing_node.size[1] < max_slots * LiteGraph.NODE_SLOT_HEIGHT + 4)
				this.resizing_node.size[1] = max_slots * LiteGraph.NODE_SLOT_HEIGHT + 4;
			if(this.resizing_node.size[0] < LiteGraph.NODE_MIN_WIDTH)
				this.resizing_node.size[0] = LiteGraph.NODE_MIN_WIDTH;

			this.canvas.style.cursor = "se-resize";
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
		}
	}

	/*
	if((this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null) 
		this.draw();
	*/

	e.preventDefault();
	//e.stopPropagation();
	return false;
	//this is not really optimal
	//this.graph.change();
}

LGraphCanvas.prototype.processMouseUp = function(e)
{
	if(!this.graph)
		return;

	var window = this.getCanvasWindow();
	var document = window.document;

	//restore the mousemove event back to the canvas
	document.removeEventListener("mousemove", this._mousemove_callback, true );
	this.canvas.addEventListener("mousemove", this._mousemove_callback, true);
	document.removeEventListener("mouseup", this._mouseup_callback, true );

	this.adjustMouseEvent(e);

	if (e.which == 1) //left button
	{
		//dragging a connection
		if(this.connecting_node)
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;

			var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes );

			//node below mouse
			if(node)
			{
				if( this.connecting_output.type == LiteGraph.EVENT && this.isOverNodeBox( node, e.canvasX, e.canvasY ) )
				{
					this.connecting_node.connect( this.connecting_slot, node, LiteGraph.EVENT );
				}
				else
				{
					//slot below mouse? connect
					var slot = this.isOverNodeInput(node, e.canvasX, e.canvasY);
					if(slot != -1)
					{
						this.connecting_node.connect(this.connecting_slot, node, slot);
					}
					else
					{ //not on top of an input
						var input = node.getInputInfo(0);
						//auto connect
						if(this.connecting_output.type == LiteGraph.EVENT)
							this.connecting_node.connect( this.connecting_slot, node, LiteGraph.EVENT );
						else
							if(input && !input.link && input.type == this.connecting_output.type) //toLowerCase missing
								this.connecting_node.connect(this.connecting_slot, node, 0);
					}
				}
			}

			this.connecting_output = null;
			this.connecting_pos = null;
			this.connecting_node = null;
			this.connecting_slot = -1;

		}//not dragging connection
		else if(this.resizing_node)
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
			this.resizing_node = null;
		}
		else if(this.node_dragged) //node being dragged?
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
			this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
			this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
			if(this.graph.config.align_to_grid)
				this.node_dragged.alignToGrid();
			this.node_dragged = null;
		}
		else //no node being dragged
		{
			this.dirty_canvas = true;
			this.dragging_canvas = false;

			if( this.node_over && this.node_over.onMouseUp )
				this.node_over.onMouseUp(e, [e.canvasX - this.node_over.pos[0], e.canvasY - this.node_over.pos[1]] );
			if( this.node_capturing_input && this.node_capturing_input.onMouseUp )
				this.node_capturing_input.onMouseUp(e, [e.canvasX - this.node_capturing_input.pos[0], e.canvasY - this.node_capturing_input.pos[1]] );
		}
	}
	else if (e.which == 2) //middle button
	{
		//trace("middle");
		this.dirty_canvas = true;
		this.dragging_canvas = false;
	}
	else if (e.which == 3) //right button
	{
		//trace("right");
		this.dirty_canvas = true;
		this.dragging_canvas = false;
	}

	/*
	if((this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
		this.draw();
	*/

	this.graph.change();

	e.stopPropagation();
	e.preventDefault();
	return false;
}


LGraphCanvas.prototype.processMouseWheel = function(e) 
{
	if(!this.graph || !this.allow_dragcanvas)
		return;

	var delta = (e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60);

	this.adjustMouseEvent(e);

	var zoom = this.scale;

	if (delta > 0)
		zoom *= 1.1;
	else if (delta < 0)
		zoom *= 1/(1.1);

	this.setZoom( zoom, [ e.localX, e.localY ] );

	/*
	if(this.rendering_timer_id == null)
		this.draw();
	*/

	this.graph.change();

	e.preventDefault();
	return false; // prevent default
}

LGraphCanvas.prototype.isOverNodeBox = function( node, canvasx, canvasy )
{
	var title_height = LiteGraph.NODE_TITLE_HEIGHT;
	if( isInsideRectangle( canvasx, canvasy, node.pos[0] + 2, node.pos[1] + 2 - title_height, title_height - 4,title_height - 4) )
		return true;
	return false;
}

LGraphCanvas.prototype.isOverNodeInput = function(node, canvasx, canvasy, slot_pos )
{
	if(node.inputs)
		for(var i = 0, l = node.inputs.length; i < l; ++i)
		{
			var input = node.inputs[i];
			var link_pos = node.getConnectionPos(true,i);
			if( isInsideRectangle(canvasx, canvasy, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
			{
				if(slot_pos)
				{ 
					slot_pos[0] = link_pos[0];
					slot_pos[1] = link_pos[1];
				}
				return i;
			}
		}
	return -1;
}

LGraphCanvas.prototype.processKey = function(e) 
{
	if(!this.graph)
		return;

	var block_default = false;

	if(e.type == "keydown")
	{
		//select all Control A
		if(e.keyCode == 65 && e.ctrlKey)
		{
			this.selectAllNodes();
			block_default = true;
		}

		//delete or backspace
		if(e.keyCode == 46 || e.keyCode == 8)
		{
			this.deleteSelectedNodes();
			block_default = true;
		}

		//collapse
		//...

		//TODO
		if(this.selected_nodes) 
			for (var i in this.selected_nodes)
				if(this.selected_nodes[i].onKeyDown)
					this.selected_nodes[i].onKeyDown(e);
	}
	else if( e.type == "keyup" )
	{
		if(this.selected_nodes)
			for (var i in this.selected_nodes)
				if(this.selected_nodes[i].onKeyUp)
					this.selected_nodes[i].onKeyUp(e);
	}

	this.graph.change();

	if(block_default)
	{
		e.preventDefault();
		return false;
	}
}

LGraphCanvas.prototype.processDrop = function(e)
{
	e.preventDefault();
	this.adjustMouseEvent(e);

	
	var pos = [e.canvasX,e.canvasY];
	var node = this.graph.getNodeOnPos(pos[0],pos[1]);

	if(!node)
	{
		var r = null;
		if(this.onDropItem)
			r = this.onDropItem( event );
		if(!r)
			this.checkDropItem(e);
		return;
	}

	if( node.onDropFile || node.onDropData )
	{
		var files = e.dataTransfer.files;
		if(files && files.length)
		{
			for(var i=0; i < files.length; i++)
			{
				var file = e.dataTransfer.files[0];
				var filename = file.name;
				var ext = LGraphCanvas.getFileExtension( filename );
				//console.log(file);

				if(node.onDropFile)
					node.onDropFile(file);

				if(node.onDropData)
				{
					//prepare reader
					var reader = new FileReader();
					reader.onload = function (event) {
						//console.log(event.target);
						var data = event.target.result;
						node.onDropData( data, filename, file );
					};

					//read data
					var type = file.type.split("/")[0];
					if(type == "text" || type == "")
						reader.readAsText(file);
					else if (type == "image")
						reader.readAsDataURL(file);
					else
						reader.readAsArrayBuffer(file);
				}
			}
		}
	}

	if(node.onDropItem)
	{
		if( node.onDropItem( event ) )
			return true;
	}

	if(this.onDropItem)
		return this.onDropItem( event );

	return false;
}

//called if the graph doesnt have a default drop item behaviour
LGraphCanvas.prototype.checkDropItem = function(e)
{
	if(e.dataTransfer.files.length)
	{
		var file = e.dataTransfer.files[0];
		var ext = LGraphCanvas.getFileExtension( file.name ).toLowerCase();
		var nodetype = LiteGraph.node_types_by_file_extension[ext];
		if(nodetype)
		{
			var node = LiteGraph.createNode( nodetype.type );
			node.pos = [e.canvasX, e.canvasY];
			this.graph.add( node );
			if( node.onDropFile )
				node.onDropFile( file );
		}
	}
}


LGraphCanvas.prototype.processNodeSelected = function(n,e)
{
	n.selected = true;
	if (n.onSelected)
		n.onSelected();
		
	if(e && e.shiftKey) //add to selection
		this.selected_nodes[n.id] = n;
	else
	{
		this.selected_nodes = {};
		this.selected_nodes[ n.id ] = n;
	}
		
	this.dirty_canvas = true;

	if(this.onNodeSelected)
		this.onNodeSelected(n);

	//if(this.node_in_panel) this.showNodePanel(n);
}

LGraphCanvas.prototype.processNodeDeselected = function(n)
{
	n.selected = false;
	if(n.onDeselected)
		n.onDeselected();
		
	delete this.selected_nodes[n.id];

	if(this.onNodeDeselected)
		this.onNodeDeselected(n);

	this.dirty_canvas = true;
}

LGraphCanvas.prototype.processNodeDblClicked = function(n)
{
	if(this.onShowNodePanel)
		this.onShowNodePanel(n);

	if(this.onNodeDblClicked)
		this.onNodeDblClicked(n);

	this.setDirty(true);
}

LGraphCanvas.prototype.selectNode = function(node)
{
	this.deselectAllNodes();

	if(!node)
		return;

	if(!node.selected && node.onSelected)
		node.onSelected();
	node.selected = true;
	this.selected_nodes[ node.id ] = node;
	this.setDirty(true);
}

LGraphCanvas.prototype.selectAllNodes = function()
{
	for(var i = 0; i < this.graph._nodes.length; ++i)
	{
		var n = this.graph._nodes[i];
		if(!n.selected && n.onSelected)
			n.onSelected();
		n.selected = true;
		this.selected_nodes[this.graph._nodes[i].id] = n;
	}

	this.setDirty(true);
}

LGraphCanvas.prototype.deselectAllNodes = function()
{
	for(var i in this.selected_nodes)
	{
		var n = this.selected_nodes;
		if(n.onDeselected)
			n.onDeselected();
		n.selected = false;
	}
	this.selected_nodes = {};
	this.setDirty(true);
}

LGraphCanvas.prototype.deleteSelectedNodes = function()
{
	for(var i in this.selected_nodes)
	{
		var m = this.selected_nodes[i];
		//if(m == this.node_in_panel) this.showNodePanel(null);
		this.graph.remove(m);
	}
	this.selected_nodes = {};
	this.setDirty(true);
}

LGraphCanvas.prototype.centerOnNode = function(node)
{
	this.offset[0] = -node.pos[0] - node.size[0] * 0.5 + (this.canvas.width * 0.5 / this.scale);
	this.offset[1] = -node.pos[1] - node.size[1] * 0.5 + (this.canvas.height * 0.5 / this.scale);
	this.setDirty(true,true);
}

LGraphCanvas.prototype.adjustMouseEvent = function(e)
{
	var b = this.canvas.getBoundingClientRect();
	e.localX = e.pageX - b.left;
	e.localY = e.pageY - b.top;

	e.canvasX = e.localX / this.scale - this.offset[0];
	e.canvasY = e.localY / this.scale - this.offset[1];
}

LGraphCanvas.prototype.setZoom = function(value, zooming_center)
{
	if(!zooming_center)
		zooming_center = [this.canvas.width * 0.5,this.canvas.height * 0.5];

	var center = this.convertOffsetToCanvas( zooming_center );

	this.scale = value;

	if(this.scale > this.max_zoom)
		this.scale = this.max_zoom;
	else if(this.scale < this.min_zoom)
		this.scale = this.min_zoom;
	
	var new_center = this.convertOffsetToCanvas( zooming_center );
	var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]];

	this.offset[0] += delta_offset[0];
	this.offset[1] += delta_offset[1];

	this.dirty_canvas = true;
	this.dirty_bgcanvas = true;
}

LGraphCanvas.prototype.convertOffsetToCanvas = function(pos)
{
	return [pos[0] / this.scale - this.offset[0], pos[1] / this.scale - this.offset[1]];
}

LGraphCanvas.prototype.convertCanvasToOffset = function(pos)
{
	return [(pos[0] + this.offset[0]) * this.scale, 
		(pos[1] + this.offset[1]) * this.scale ];
}

LGraphCanvas.prototype.convertEventToCanvas = function(e)
{
	var rect = this.canvas.getClientRects()[0];
	return this.convertOffsetToCanvas([e.pageX - rect.left,e.pageY - rect.top]);
}

LGraphCanvas.prototype.bringToFront = function(n)
{
	var i = this.graph._nodes.indexOf(n);
	if(i == -1) return;
	
	this.graph._nodes.splice(i,1);
	this.graph._nodes.push(n);
}

LGraphCanvas.prototype.sendToBack = function(n)
{
	var i = this.graph._nodes.indexOf(n);
	if(i == -1) return;
	
	this.graph._nodes.splice(i,1);
	this.graph._nodes.unshift(n);
}
	
/* Interaction */



/* LGraphCanvas render */

LGraphCanvas.prototype.computeVisibleNodes = function()
{
	var visible_nodes = [];
	for(var i = 0, l = this.graph._nodes.length; i < l; ++i)
	{
		var n = this.graph._nodes[i];

		//skip rendering nodes in live mode
		if(this.live_mode && !n.onDrawBackground && !n.onDrawForeground)
			continue;

		if(!overlapBounding(this.visible_area, n.getBounding() ))
			continue; //out of the visible area

		visible_nodes.push(n);
	}
	return visible_nodes;
}

LGraphCanvas.prototype.draw = function(force_canvas, force_bgcanvas)
{
	if(!this.canvas)
		return;

	//fps counting
	var now = LiteGraph.getTime();
	this.render_time = (now - this.last_draw_time)*0.001;
	this.last_draw_time = now;

	if(this.graph)
	{
		var start = [-this.offset[0], -this.offset[1] ];
		var end = [start[0] + this.canvas.width / this.scale, start[1] + this.canvas.height / this.scale];
		this.visible_area = new Float32Array([start[0],start[1],end[0],end[1]]);
	}

	if(this.dirty_bgcanvas || force_bgcanvas || this.always_render_background || (this.graph && this.graph._last_trigger_time && (now - this.graph._last_trigger_time) < 1000) )
		this.drawBackCanvas();

	if(this.dirty_canvas || force_canvas)
		this.drawFrontCanvas();

	this.fps = this.render_time ? (1.0 / this.render_time) : 0;
	this.frame += 1;
}

LGraphCanvas.prototype.drawFrontCanvas = function()
{
	if(!this.ctx)
		this.ctx = this.bgcanvas.getContext("2d");
	var ctx = this.ctx;
	if(!ctx) //maybe is using webgl...
		return;

	if(ctx.start2D)
		ctx.start2D();

	var canvas = this.canvas;

	//reset in case of error
	ctx.restore();
	ctx.setTransform(1, 0, 0, 1, 0, 0);

	//clip dirty area if there is one, otherwise work in full canvas
	if(this.dirty_area)
	{
		ctx.save();
		ctx.beginPath();
		ctx.rect(this.dirty_area[0],this.dirty_area[1],this.dirty_area[2],this.dirty_area[3]);
		ctx.clip();
	}

	//clear
	//canvas.width = canvas.width;
	if(this.clear_background)
		ctx.clearRect(0,0,canvas.width, canvas.height);

	//draw bg canvas
	if(this.bgcanvas == this.canvas)
		this.drawBackCanvas();
	else
		ctx.drawImage(this.bgcanvas,0,0);

	//rendering
	if(this.onRender)
		this.onRender(canvas, ctx);

	//info widget
	if(this.show_info)
		this.renderInfo(ctx);

	if(this.graph)
	{
		//apply transformations
		ctx.save();
		ctx.scale(this.scale,this.scale);
		ctx.translate(this.offset[0],this.offset[1]);

		//draw nodes
		var drawn_nodes = 0;
		var visible_nodes = this.computeVisibleNodes();
		this.visible_nodes = visible_nodes;

		for (var i = 0; i < visible_nodes.length; ++i)
		{
			var node = visible_nodes[i];

			//transform coords system
			ctx.save();
			ctx.translate( node.pos[0], node.pos[1] );

			//Draw
			this.drawNode(node, ctx );
			drawn_nodes += 1;

			//Restore
			ctx.restore();
		}
		
		//connections ontop?
		if(this.graph.config.links_ontop)
			if(!this.live_mode)
				this.drawConnections(ctx);

		//current connection
		if(this.connecting_pos != null)
		{
			ctx.lineWidth = this.connections_width;
			var link_color = null;
			switch( this.connecting_output.type )
			{
				case LiteGraph.EVENT: link_color = "#F85"; break;
				default:
					link_color = "#AFA";
			}
			this.renderLink(ctx, this.connecting_pos, [this.canvas_mouse[0],this.canvas_mouse[1]], link_color );

			ctx.beginPath();

			if( this.connecting_output.type === LiteGraph.EVENT )
				ctx.rect( (this.connecting_pos[0] - 6) + 0.5, (this.connecting_pos[1] - 5) + 0.5,14,10);
			else
				ctx.arc( this.connecting_pos[0], this.connecting_pos[1],4,0,Math.PI*2);

			/*
			if( this.connecting_output.round)
				ctx.arc( this.connecting_pos[0], this.connecting_pos[1],4,0,Math.PI*2);
			else
				ctx.rect( this.connecting_pos[0], this.connecting_pos[1],12,6);
			*/
			ctx.fill();

			ctx.fillStyle = "#ffcc00";
			if(this._highlight_input)
			{
				ctx.beginPath();
				ctx.arc( this._highlight_input[0], this._highlight_input[1],6,0,Math.PI*2);
				ctx.fill();
			}
		}
		ctx.restore();
	}

	if(this.dirty_area)
	{
		ctx.restore();
		//this.dirty_area = null;
	}

	if(ctx.finish2D) //this is a function I use in webgl renderer
		ctx.finish2D();

	this.dirty_canvas = false;
}

LGraphCanvas.prototype.renderInfo = function( ctx, x, y )
{
	x = x || 0;
	y = y || 0;

	ctx.save();
	ctx.translate( x, y );

	ctx.font = "10px Arial";
	ctx.fillStyle = "#888";
	if(this.graph)
	{
		ctx.fillText( "T: " + this.graph.globaltime.toFixed(2)+"s",5,13*1 );
		ctx.fillText( "I: " + this.graph.iteration,5,13*2 );
		ctx.fillText( "F: " + this.frame,5,13*3 );
		ctx.fillText( "FPS:" + this.fps.toFixed(2),5,13*4 );
	}
	else
		ctx.fillText( "No graph selected",5,13*1 );
	ctx.restore();
}

LGraphCanvas.prototype.drawBackCanvas = function()
{
	var canvas = this.bgcanvas;
	if(canvas.width != this.canvas.width ||
		canvas.height != this.canvas.height)
	{
		canvas.width = this.canvas.width;
		canvas.height = this.canvas.height;
	}

	if(!this.bgctx)
		this.bgctx = this.bgcanvas.getContext("2d");
	var ctx = this.bgctx;
	if(ctx.start)
		ctx.start();

	//clear
	if(this.clear_background)
		ctx.clearRect(0,0,canvas.width, canvas.height);

	//reset in case of error
	ctx.restore();
	ctx.setTransform(1, 0, 0, 1, 0, 0);

	if(this.graph)
	{
		//apply transformations
		ctx.save();
		ctx.scale(this.scale,this.scale);
		ctx.translate(this.offset[0],this.offset[1]);

		//render BG
		if(this.background_image && this.scale > 0.5)
		{
			ctx.globalAlpha = (1.0 - 0.5 / this.scale) * this.editor_alpha;
			ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = false;
			if(!this._bg_img || this._bg_img.name != this.background_image)
			{
				this._bg_img = new Image();
				this._bg_img.name = this.background_image; 
				this._bg_img.src = this.background_image;
				var that = this;
				this._bg_img.onload = function() { 
					that.draw(true,true);
				}
			}

			var pattern = null;
			if(this._pattern == null && this._bg_img.width > 0)
			{
				pattern = ctx.createPattern( this._bg_img, 'repeat' );
				this._pattern_img = this._bg_img;
				this._pattern = pattern;
			}
			else
				pattern = this._pattern;
			if(pattern)
			{
				ctx.fillStyle = pattern;
				ctx.fillRect(this.visible_area[0],this.visible_area[1],this.visible_area[2]-this.visible_area[0],this.visible_area[3]-this.visible_area[1]);
				ctx.fillStyle = "transparent";
			}

			ctx.globalAlpha = 1.0;
			ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = true;
		}

		if(this.onBackgroundRender)
			this.onBackgroundRender(canvas, ctx);

		//DEBUG: show clipping area
		//ctx.fillStyle = "red";
		//ctx.fillRect( this.visible_area[0] + 10, this.visible_area[1] + 10, this.visible_area[2] - this.visible_area[0] - 20, this.visible_area[3] - this.visible_area[1] - 20);

		//bg
		ctx.strokeStyle = "#235";
		ctx.strokeRect(0,0,canvas.width,canvas.height);

		if(this.render_connections_shadows)
		{
			ctx.shadowColor = "#000";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = 6;
		}
		else
			ctx.shadowColor = "rgba(0,0,0,0)";

		//draw connections
		if(!this.live_mode)
			this.drawConnections(ctx);

		ctx.shadowColor = "rgba(0,0,0,0)";

		//restore state
		ctx.restore();
	}

	if(ctx.finish)
		ctx.finish();

	this.dirty_bgcanvas = false;
	this.dirty_canvas = true; //to force to repaint the front canvas with the bgcanvas 
}

/* Renders the LGraphNode on the canvas */
LGraphCanvas.prototype.drawNode = function(node, ctx )
{
	var glow = false;

	var color = node.color || LiteGraph.NODE_DEFAULT_COLOR;
	//if (this.selected) color = "#88F";

	var render_title = true;
	if(node.flags.skip_title_render || node.graph.isLive())
		render_title = false;
	if(node.mouseOver)
		render_title = true;

	//shadow and glow
	if (node.mouseOver) glow = true;
	
	if(node.selected)
	{
		/*
		ctx.shadowColor = "#EEEEFF";//glow ? "#AAF" : "#000";
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.shadowBlur = 1;
		*/
	}
	else if(this.render_shadows)
	{
		ctx.shadowColor = "rgba(0,0,0,0.5)";
		ctx.shadowOffsetX = 2;
		ctx.shadowOffsetY = 2;
		ctx.shadowBlur = 3;
	}
	else
		ctx.shadowColor = "transparent";

	//only render if it forces it to do it
	if(this.live_mode)
	{
		if(!node.flags.collapsed)
		{
			ctx.shadowColor = "transparent";
			//if(node.onDrawBackground)
			//	node.onDrawBackground(ctx);
			if(node.onDrawForeground)
				node.onDrawForeground(ctx);
		}

		return;
	}

	//draw in collapsed form
	/*
	if(node.flags.collapsed)
	{
		if(!node.onDrawCollapsed || node.onDrawCollapsed(ctx) == false)
			this.drawNodeCollapsed(node, ctx, color, node.bgcolor);
		return;
	}
	*/

	var editor_alpha = this.editor_alpha;
	ctx.globalAlpha = editor_alpha;

	//clip if required (mask)
	var shape = node.shape || "box";
	var size = new Float32Array(node.size);
	if(node.flags.collapsed)
	{
		size[0] = LiteGraph.NODE_COLLAPSED_WIDTH;
		size[1] = 0;
	}

	//Start clipping
	if(node.flags.clip_area)
	{
		ctx.save();
		if(shape == "box")
		{
			ctx.beginPath();
			ctx.rect(0,0,size[0], size[1]);
		}
		else if (shape == "round")
		{
			ctx.roundRect(0,0,size[0], size[1],10);
		}
		else if (shape == "circle")
		{
			ctx.beginPath();
			ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI*2);
		}
		ctx.clip();
	}

	//draw shape
	this.drawNodeShape(node, ctx, size, color, node.bgcolor, !render_title, node.selected );
	ctx.shadowColor = "transparent";

	//connection slots
	ctx.textAlign = "left";
	ctx.font = this.inner_text_font;

	var render_text = this.scale > 0.6;

	var out_slot = this.connecting_output;

	//render inputs and outputs
	if(!node.flags.collapsed)
	{
		//input connection slots
		if(node.inputs)
			for(var i = 0; i < node.inputs.length; i++)
			{
				var slot = node.inputs[i];

				ctx.globalAlpha = editor_alpha;
				//change opacity of incompatible slots
				if ( this.connecting_node && LiteGraph.isValidConnection( slot.type && out_slot.type ) )
					ctx.globalAlpha = 0.4 * editor_alpha;

				ctx.fillStyle = slot.link != null ? "#7F7" : "#AAA";

				var pos = node.getConnectionPos(true,i);
				pos[0] -= node.pos[0];
				pos[1] -= node.pos[1];

				ctx.beginPath();

				if (slot.type === LiteGraph.EVENT)
					ctx.rect((pos[0] - 6) + 0.5, (pos[1] - 5) + 0.5,14,10);
				else
					ctx.arc(pos[0],pos[1],4,0,Math.PI*2);

				ctx.fill();

				//render name
				if(render_text)
				{
					var text = slot.label != null ? slot.label : slot.name;
					if(text)
					{
						ctx.fillStyle = color; 
						ctx.fillText(text,pos[0] + 10,pos[1] + 5);
					}
				}
			}

		//output connection slots
		if(this.connecting_node)
			ctx.globalAlpha = 0.4 * editor_alpha;

		ctx.lineWidth = 1;

		ctx.textAlign = "right";
		ctx.strokeStyle = "black";
		if(node.outputs)
			for(var i = 0; i < node.outputs.length; i++)
			{
				var slot = node.outputs[i];

				var pos = node.getConnectionPos(false,i);
				pos[0] -= node.pos[0];
				pos[1] -= node.pos[1];

				ctx.fillStyle = slot.links && slot.links.length ? "#7F7" : "#AAA";
				ctx.beginPath();
				//ctx.rect( node.size[0] - 14,i*14,10,10);

				if (slot.type === LiteGraph.EVENT)
					ctx.rect((pos[0] - 6) + 0.5,(pos[1] - 5) + 0.5,14,10);
				else
					ctx.arc( pos[0],pos[1],4,0, Math.PI*2 );

				//trigger
				//if(slot.node_id != null && slot.slot == -1)
				//	ctx.fillStyle = "#F85";

				//if(slot.links != null && slot.links.length)
				ctx.fill();
				ctx.stroke();

				//render output name
				if(render_text)
				{
					var text = slot.label != null ? slot.label : slot.name;
					if(text)
					{
						ctx.fillStyle = color;
						ctx.fillText(text, pos[0] - 10,pos[1] + 5);
					}
				}
			}

		ctx.textAlign = "left";
		ctx.globalAlpha = 1;

		if(node.onDrawForeground)
			node.onDrawForeground(ctx);
	}//!collapsed

	if(node.flags.clip_area)
		ctx.restore();

	ctx.globalAlpha = 1.0;
}

/* Renders the node shape */
LGraphCanvas.prototype.drawNodeShape = function(node, ctx, size, fgcolor, bgcolor, no_title, selected )
{
	//bg rect
	ctx.strokeStyle = fgcolor || LiteGraph.NODE_DEFAULT_COLOR;
	ctx.fillStyle = bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR;

	/* gradient test
	var grad = ctx.createLinearGradient(0,0,0,node.size[1]);
	grad.addColorStop(0, "#AAA");
	grad.addColorStop(0.5, fgcolor || LiteGraph.NODE_DEFAULT_COLOR);
	grad.addColorStop(1, bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR);
	ctx.fillStyle = grad;
	//*/

	var title_height = LiteGraph.NODE_TITLE_HEIGHT;

	//render depending on shape
	var shape = node.shape || "box";
	if(shape == "box")
	{
		ctx.beginPath();
		ctx.rect(0,no_title ? 0 : -title_height, size[0]+1, no_title ? size[1] : size[1] + title_height);
		ctx.fill();
		ctx.shadowColor = "transparent";

		if(selected)
		{
			ctx.strokeStyle = "#CCC";
			ctx.strokeRect(-0.5,no_title ? -0.5 : -title_height + -0.5, size[0]+2, no_title ? (size[1]+2) : (size[1] + title_height+2) - 1);
			ctx.strokeStyle = fgcolor;
		}
	}
	else if (node.shape == "round")
	{
		ctx.roundRect(0,no_title ? 0 : -title_height,size[0], no_title ? size[1] : size[1] + title_height, 10);
		ctx.fill();
	}
	else if (node.shape == "circle")
	{
		ctx.beginPath();
		ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI*2);
		ctx.fill();
	}

	ctx.shadowColor = "transparent";

	//ctx.stroke();

	//image
	if (node.bgImage && node.bgImage.width)
		ctx.drawImage( node.bgImage, (size[0] - node.bgImage.width) * 0.5 , (size[1] - node.bgImage.height) * 0.5);

	if(node.bgImageUrl && !node.bgImage)
		node.bgImage = node.loadImage(node.bgImageUrl);

	if(node.onDrawBackground)
		node.onDrawBackground(ctx);

	//title bg (remember, it is rendered ABOVE the node
	if(!no_title)
	{
		ctx.fillStyle = fgcolor || LiteGraph.NODE_DEFAULT_COLOR;
		var old_alpha = ctx.globalAlpha;
		ctx.globalAlpha = 0.5 * old_alpha;
		if(shape == "box")
		{
			ctx.beginPath();
			ctx.rect(0, -title_height, size[0]+1, title_height);
			ctx.fill()
			//ctx.stroke();
		}
		else if (shape == "round")
		{
			ctx.roundRect(0,-title_height,size[0], title_height,10,0);
			//ctx.fillRect(0,8,size[0],NODE_TITLE_HEIGHT - 12);
			ctx.fill();
			//ctx.stroke();
		}

		//title box
		ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
		ctx.beginPath();
		if (shape == "round")
			ctx.arc(title_height *0.5, title_height * -0.5, (title_height - 6) *0.5,0,Math.PI*2);
		else
			ctx.rect(3,-title_height + 3,title_height - 6,title_height - 6);
		ctx.fill();
		ctx.globalAlpha = old_alpha;

		//title text
		ctx.font = this.title_text_font;
		var title = node.getTitle();
		if(title && this.scale > 0.5)
		{
			ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
			ctx.fillText( title, 16, 13 - title_height );
		}
	}
}

/* Renders the node when collapsed */
LGraphCanvas.prototype.drawNodeCollapsed = function(node, ctx, fgcolor, bgcolor)
{
	//draw default collapsed shape
	ctx.strokeStyle = fgcolor || LiteGraph.NODE_DEFAULT_COLOR;
	ctx.fillStyle = bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR;

	var collapsed_radius = LiteGraph.NODE_COLLAPSED_RADIUS;

	//circle shape
	var shape = node.shape || "box";
	if(shape == "circle")
	{
		ctx.beginPath();
		ctx.arc(node.size[0] * 0.5, node.size[1] * 0.5, collapsed_radius,0,Math.PI * 2);
		ctx.fill();
		ctx.shadowColor = "rgba(0,0,0,0)";
		ctx.stroke();

		ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
		ctx.beginPath();
		ctx.arc(node.size[0] * 0.5, node.size[1] * 0.5, collapsed_radius * 0.5,0,Math.PI * 2);
		ctx.fill();
	}
	else if(shape == "round") //rounded box
	{
		ctx.beginPath();
		ctx.roundRect(node.size[0] * 0.5 - collapsed_radius, node.size[1] * 0.5 - collapsed_radius, 2*collapsed_radius,2*collapsed_radius,5);
		ctx.fill();
		ctx.shadowColor = "rgba(0,0,0,0)";
		ctx.stroke();

		ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
		ctx.beginPath();
		ctx.roundRect(node.size[0] * 0.5 - collapsed_radius*0.5, node.size[1] * 0.5 - collapsed_radius*0.5, collapsed_radius,collapsed_radius,2);
		ctx.fill();
	}
	else //flat box
	{
		ctx.beginPath();
		//ctx.rect(node.size[0] * 0.5 - collapsed_radius, node.size[1] * 0.5 - collapsed_radius, 2*collapsed_radius, 2*collapsed_radius);
		ctx.rect(0, 0, node.size[0], collapsed_radius * 2 );
		ctx.fill();
		ctx.shadowColor = "rgba(0,0,0,0)";
		ctx.stroke();

		ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
		ctx.beginPath();
		//ctx.rect(node.size[0] * 0.5 - collapsed_radius*0.5, node.size[1] * 0.5 - collapsed_radius*0.5, collapsed_radius,collapsed_radius);
		ctx.rect(collapsed_radius*0.5, collapsed_radius*0.5, collapsed_radius, collapsed_radius);
		ctx.fill();
	}
}

//OPTIMIZE THIS: precatch connections position instead of recomputing them every time
LGraphCanvas.prototype.drawConnections = function(ctx)
{
	var now = LiteGraph.getTime();

	//draw connections
	ctx.lineWidth = this.connections_width;

	ctx.fillStyle = "#AAA";
	ctx.strokeStyle = "#AAA";
	ctx.globalAlpha = this.editor_alpha;
	//for every node
	for (var n = 0, l = this.graph._nodes.length; n < l; ++n)
	{
		var node = this.graph._nodes[n];
		//for every input (we render just inputs because it is easier as every slot can only have one input)
		if(node.inputs && node.inputs.length)
			for(var i = 0; i < node.inputs.length; ++i)
			{
				var input = node.inputs[i];
				if(!input || input.link == null) 
					continue;
				var link_id = input.link;
				var link = this.graph.links[ link_id ];
				if(!link)
					continue;

				var start_node = this.graph.getNodeById( link.origin_id );
				if(start_node == null) continue;
				var start_node_slot = link.origin_slot;
				var start_node_slotpos = null;

				if(start_node_slot == -1)
					start_node_slotpos = [start_node.pos[0] + 10, start_node.pos[1] + 10];
				else
					start_node_slotpos = start_node.getConnectionPos(false, start_node_slot);

				var color = LGraphCanvas.link_type_colors[ node.inputs[i].type ] || this.default_link_color;

				this.renderLink(ctx, start_node_slotpos, node.getConnectionPos(true,i), color );

				if(link && link._last_time && now - link._last_time < 1000 )
				{
					var f = 2.0 - (now - link._last_time) * 0.002;
					var color = "rgba(255,255,255, " + f.toFixed(2) + ")";
					this.renderLink( ctx, start_node_slotpos, node.getConnectionPos(true,i) , color, true, f );
				}
			}
	}
	ctx.globalAlpha = 1;
}

LGraphCanvas.prototype.renderLink = function(ctx,a,b,color, skip_border, flow )
{
	if(!this.highquality_render)
	{
		ctx.beginPath();
		ctx.moveTo(a[0],a[1]);
		ctx.lineTo(b[0],b[1]);
		ctx.stroke();
		return;
	}

	var dist = distance(a,b);

	if(this.render_connections_border && this.scale > 0.6)
		ctx.lineWidth = this.connections_width + 4;

	ctx.beginPath();
	
	if(this.render_curved_connections) //splines
	{
		ctx.moveTo(a[0],a[1]);
		ctx.bezierCurveTo(a[0] + dist*0.25, a[1],
							b[0] - dist*0.25 , b[1],
							b[0] ,b[1] );
	}
	else //lines
	{
		ctx.moveTo(a[0]+10,a[1]);
		ctx.lineTo(((a[0]+10) + (b[0]-10))*0.5,a[1]);
		ctx.lineTo(((a[0]+10) + (b[0]-10))*0.5,b[1]);
		ctx.lineTo(b[0]-10,b[1]);
	}

	if(this.render_connections_border && this.scale > 0.6 && !skip_border)
	{
		ctx.strokeStyle = "rgba(0,0,0,0.5)";
		ctx.stroke();
	}

	ctx.lineWidth = this.connections_width;
	ctx.fillStyle = ctx.strokeStyle = color;
	ctx.stroke();

	//no symbols
	if(!this.render_connection_arrows || this.scale < 0.6)
		return;

	//render arrow
	if(this.render_connection_arrows && this.scale > 0.6)
	{
		var pos = this.computeConnectionPoint(a,b,0.5);
		var pos2 = this.computeConnectionPoint(a,b,0.51);

		//get two points in the bezier curve
		var angle = 0;
		if(this.render_curved_connections)
			angle = -Math.atan2( pos2[0] - pos[0], pos2[1] - pos[1]);
		else
			angle = b[1] > a[1] ? 0 : Math.PI;

		ctx.save();
		ctx.translate(pos[0],pos[1]);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.moveTo(-5,-5);
		ctx.lineTo(0,+5);
		ctx.lineTo(+5,-5);
		ctx.fill();
		ctx.restore();
	}

	if(flow)
	{
		for(var i = 0; i < 5; ++i)
		{
			var f = (LiteGraph.getTime() * 0.001 + (i * 0.2)) % 1;
			var pos = this.computeConnectionPoint(a,b,f);
			ctx.beginPath();
			ctx.arc(pos[0],pos[1],5,0,2*Math.PI);
			ctx.fill();
		}
	}
}

LGraphCanvas.prototype.computeConnectionPoint = function(a,b,t)
{
	var dist = distance(a,b);
	var p0 = a;
	var p1 = [ a[0] + dist*0.25, a[1] ];
	var p2 = [ b[0] - dist*0.25, b[1] ];
	var p3 = b;

	var c1 = (1-t)*(1-t)*(1-t);
	var c2 = 3*((1-t)*(1-t))*t;
	var c3 = 3*(1-t)*(t*t);
	var c4 = t*t*t;

	var x = c1*p0[0] + c2*p1[0] + c3*p2[0] + c4*p3[0];
	var y = c1*p0[1] + c2*p1[1] + c3*p2[1] + c4*p3[1];
	return [x,y];
}

/*
LGraphCanvas.prototype.resizeCanvas = function(width,height)
{
	this.canvas.width = width;
	if(height)
		this.canvas.height = height;

	this.bgcanvas.width = this.canvas.width;
	this.bgcanvas.height = this.canvas.height;
	this.draw(true,true);
}
*/

LGraphCanvas.prototype.resize = function(width, height)
{
	if(!width && !height)
	{
		var parent = this.canvas.parentNode;
		width = parent.offsetWidth;
		height = parent.offsetHeight;
	}

	if(this.canvas.width == width && this.canvas.height == height)
		return;

	this.canvas.width = width;
	this.canvas.height = height;
	this.bgcanvas.width = this.canvas.width;
	this.bgcanvas.height = this.canvas.height;
	this.setDirty(true,true);
}


LGraphCanvas.prototype.switchLiveMode = function(transition)
{
	if(!transition)
	{
		this.live_mode = !this.live_mode;
		this.dirty_canvas = true;
		this.dirty_bgcanvas = true;
		return;
	}

	var self = this;
	var delta = this.live_mode ? 1.1 : 0.9;
	if(this.live_mode)
	{
		this.live_mode = false;
		this.editor_alpha = 0.1;
	}

	var t = setInterval(function() {
		self.editor_alpha *= delta;
		self.dirty_canvas = true;
		self.dirty_bgcanvas = true;

		if(delta < 1  && self.editor_alpha < 0.01)
		{
			clearInterval(t);
			if(delta < 1)
				self.live_mode = true;
		}
		if(delta > 1 && self.editor_alpha > 0.99)
		{
			clearInterval(t);
			self.editor_alpha = 1;
		}
	},1);
}

LGraphCanvas.prototype.onNodeSelectionChange = function(node)
{
	return; //disabled
	//if(this.node_in_panel) this.showNodePanel(node);
}

LGraphCanvas.prototype.touchHandler = function(event)
{
	//alert("foo");
    var touches = event.changedTouches,
        first = touches[0],
        type = "";

         switch(event.type)
    {
        case "touchstart": type = "mousedown"; break;
        case "touchmove":  type="mousemove"; break;        
        case "touchend":   type="mouseup"; break;
        default: return;
    }

             //initMouseEvent(type, canBubble, cancelable, view, clickCount,
    //           screenX, screenY, clientX, clientY, ctrlKey,
    //           altKey, shiftKey, metaKey, button, relatedTarget);

	var window = this.getCanvasWindow();
	var document = window.document;
    
    var simulatedEvent = document.createEvent("MouseEvent");
    simulatedEvent.initMouseEvent(type, true, true, window, 1,
                              first.screenX, first.screenY,
                              first.clientX, first.clientY, false,
                              false, false, false, 0/*left*/, null);
	first.target.dispatchEvent(simulatedEvent);
    event.preventDefault();
}

/* CONTEXT MENU ********************/

LGraphCanvas.onMenuAdd = function(node, e, prev_menu, canvas, first_event )
{
	var ref_window = canvas.getCanvasWindow();

	var values = LiteGraph.getNodeTypesCategories();
	var entries = {};
	for(var i in values)
		if(values[i])
			entries[ i ] = { value: values[i], content: values[i]  , is_menu: true };

	var menu = LiteGraph.createContextMenu(entries, {event: e, callback: inner_clicked, from: prev_menu}, ref_window);

	function inner_clicked(v, e)
	{
		var category = v.value;
		var node_types = LiteGraph.getNodeTypesInCategory(category);
		var values = [];
		for(var i in node_types)
			values.push( { content: node_types[i].title, value: node_types[i].type });

		LiteGraph.createContextMenu(values, {event: e, callback: inner_create, from: menu}, ref_window);
		return false;
	}

	function inner_create(v, e)
	{
		var node = LiteGraph.createNode( v.value );
		if(node)
		{
			node.pos = canvas.convertEventToCanvas(first_event);
			canvas.graph.add( node );
		}
	}

	return false;
}

LGraphCanvas.onMenuCollapseAll = function()
{

}


LGraphCanvas.onMenuNodeEdit = function()
{

}

LGraphCanvas.showMenuNodeInputs = function(node, e, prev_menu)
{
	if(!node)
		return;

	var that = this;
	var ref_window = this.getCanvasWindow();

	var options = node.optional_inputs;
	if(node.onGetInputs)
		options = node.onGetInputs();

	var entries = [];
	if(options)
		for (var i in options)
		{
			var entry = options[i];
			var label = entry[0];
			if(entry[2] && entry[2].label)
				label = entry[2].label;
			entries.push({content: label, value: entry});
		}

	if(this.onMenuNodeInputs)
		entries = this.onMenuNodeInputs( entries );

	if(!entries.length)
		return;

	var menu = LiteGraph.createContextMenu(entries, {event: e, callback: inner_clicked, from: prev_menu}, ref_window);

	function inner_clicked(v, e, prev)
	{
		if(!node)
			return;

		if(v.callback)
			v.callback.call(that, node, v, e, prev);

		if(v.value)
			node.addInput(v.value[0],v.value[1], v.value[2]);
	}

	return false;
}

LGraphCanvas.showMenuNodeOutputs = function(node, e, prev_menu)
{
	if(!node)
		return;

	var that = this;
	var ref_window = this.getCanvasWindow();

	var options = node.optional_outputs;
	if(node.onGetOutputs)
		options = node.onGetOutputs();

	var entries = [];
	if(options)
		for (var i in options)
		{
			var entry = options[i];
			if(!entry) //separator?
			{
				entries.push(null);
				continue;
			}

			if(node.findOutputSlot(entry[0]) != -1)
				continue; //skip the ones already on
			var label = entry[0];
			if(entry[2] && entry[2].label)
				label = entry[2].label;
			var data = {content: label, value: entry};
			if(entry[1] == LiteGraph.EVENT)
				data.className = "event";
			entries.push(data);
		}

	if(this.onMenuNodeOutputs)
		entries = this.onMenuNodeOutputs( entries );

	if(!entries.length)
		return;

	var menu = LiteGraph.createContextMenu(entries, {event: e, callback: inner_clicked, from: prev_menu}, ref_window);

	function inner_clicked( v, e, prev )
	{
		if(!node)
			return;

		if(v.callback)
			v.callback.call(that, node, v, e, prev);

		if(!v.value)
			return;

		var value = v.value[1];

		if(value && (value.constructor === Object || value.constructor === Array)) //submenu why?
		{
			var entries = [];
			for(var i in value)
				entries.push({content: i, value: value[i]});
			LiteGraph.createContextMenu(entries, {event: e, callback: inner_clicked, from: prev_menu});		
			return false;
		}
		else
			node.addOutput(v.value[0], v.value[1], v.value[2]);
	}

	return false;
}

LGraphCanvas.onShowMenuNodeProperties = function(node,e, prev_menu)
{
	if(!node || !node.properties)
		return;

	var that = this;
	var ref_window = this.getCanvasWindow();

	var entries = [];
		for (var i in node.properties)
		{
			var value = node.properties[i] !== undefined ? node.properties[i] : " ";
			//value could contain invalid html characters, clean that
			value = LGraphCanvas.decodeHTML(value);			
			entries.push({content: "<span class='property_name'>" + i + "</span>" + "<span class='property_value'>" + value + "</span>", value: i});
		}
	if(!entries.length)
		return;

	var menu = LiteGraph.createContextMenu(entries, {event: e, callback: inner_clicked, from: prev_menu, allow_html: true },ref_window);

	function inner_clicked( v, e, prev )
	{
		if(!node)
			return;
		that.showEditPropertyValue( node, v.value, { event: e });
	}

	return false;
}

LGraphCanvas.decodeHTML = function( str )
{
	var e = document.createElement("div");
	e.innerText = str;
	return e.innerHTML;
}

LGraphCanvas.onShowTitleEditor = function( node, event )
{
	var input_html = "";

	var dialog = document.createElement("div");
	dialog.className = "graphdialog";
	dialog.innerHTML = "<span class='name'>Title</span><input autofocus type='text' class='value'/><button>OK</button>";
	var input = dialog.querySelector("input");
	if(input)
	{
		input.value = node.title;
		input.addEventListener("keydown", function(e){
			if(e.keyCode != 13)
				return;
			inner();
			e.preventDefault();
			e.stopPropagation();
		});
	}

	var rect = this.canvas.getClientRects()[0];
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( event )
	{
		dialog.style.left = (event.pageX + offsetx) + "px";
		dialog.style.top = (event.pageY + offsety)+ "px";
	}
	else
	{
		dialog.style.left = (this.canvas.width * 0.5 + offsetx) + "px";
		dialog.style.top = (this.canvas.height * 0.5 + offsety) + "px";
	}

	var button = dialog.querySelector("button");
	button.addEventListener("click", inner );
	this.canvas.parentNode.appendChild( dialog );

	function inner()
	{
		setValue( input.value );
	}

	function setValue(value)
	{
		node.title = value;
		dialog.parentNode.removeChild( dialog );
		node.setDirtyCanvas(true,true);
	}
}

LGraphCanvas.prototype.showEditPropertyValue = function( node, property, options )
{
	if(!node || node.properties[ property ] === undefined )
		return;

	options = options || {};
	var that = this;

	var type = "string";
	
	if(node.properties[ property ] !== null)
		type = typeof(node.properties[ property ]);

	var info = null;
	if(node.getPropertyInfo)
		info = node.getPropertyInfo(property);
	if(node.properties_info)
	{
		for(var i = 0; i < node.properties_info.length; ++i)
		{
			if( node.properties_info[i].name == property )
			{
				info = node.properties_info[i];
				break;
			}
		}
	}

	if(info !== undefined && info !== null && info.type )
		type = info.type;

	var input_html = "";
	
	if(type == "string" || type == "number")
		input_html = "<input autofocus type='text' class='value'/>";
	else if(type == "enum" && info.values)
	{
		input_html = "<select autofocus type='text' class='value'>";
		for(var i in info.values)
		{
			var v = info.values.constructor === Array ? info.values[i] : i;
			input_html += "<option value='"+v+"' "+(v == node.properties[property] ? "selected" : "")+">"+info.values[i]+"</option>";
		}
		input_html += "</select>";
	}
	else if(type == "boolean")
	{
		input_html = "<input autofocus type='checkbox' class='value' "+(node.properties[property] ? "checked" : "")+"/>";
	}


	var dialog = document.createElement("div");
	dialog.className = "graphdialog";
	dialog.innerHTML = "<span class='name'>" + property + "</span>"+input_html+"<button>OK</button>";

	if(type == "enum" && info.values)
	{
		var input = dialog.querySelector("select");
		input.addEventListener("change", function(e){
			setValue( e.target.value );
			//var index = e.target.value;
			//setValue( e.options[e.selectedIndex].value );
		});
	}
	else if(type == "boolean")
	{
		var input = dialog.querySelector("input");
		if(input)
		{
			input.addEventListener("click", function(e){
				setValue( !!input.checked );
			});
		}
	}
	else
	{
		var input = dialog.querySelector("input");
		if(input)
		{
			input.value = node.properties[ property ] !== undefined ? node.properties[ property ] : "";
			input.addEventListener("keydown", function(e){
				if(e.keyCode != 13)
					return;
				inner();
				e.preventDefault();
				e.stopPropagation();
			});
		}
	}

	var rect = this.canvas.getClientRects()[0];
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( options.event )
	{
		dialog.style.left = (options.event.pageX + offsetx) + "px";
		dialog.style.top = (options.event.pageY + offsety)+ "px";
	}
	else
	{
		dialog.style.left = (this.canvas.width * 0.5 + offsetx) + "px";
		dialog.style.top = (this.canvas.height * 0.5 + offsety) + "px";
	}

	var button = dialog.querySelector("button");
	button.addEventListener("click", inner );

	this.canvas.parentNode.appendChild( dialog );


	function inner()
	{
		setValue( input.value );
	}

	function setValue(value)
	{
		if(typeof( node.properties[ property ] ) == "number")
			value = Number(value);
		node.properties[ property ] = value;

		if(node.onPropertyChanged)
			node.onPropertyChanged( property, value );
		dialog.parentNode.removeChild( dialog );
		node.setDirtyCanvas(true,true);
	}
}

LGraphCanvas.onMenuNodeCollapse = function(node)
{
	node.flags.collapsed = !node.flags.collapsed;
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.onMenuNodePin = function(node)
{
	node.pin();
}

LGraphCanvas.onMenuNodeMode = function(node, e, prev_menu)
{
	LiteGraph.createContextMenu(["Always","On Event","Never"], {event: e, callback: inner_clicked, from: prev_menu});

	function inner_clicked(v)
	{
		if(!node)
			return;
		switch(v)
		{
			case "On Event": node.mode = LiteGraph.ON_EVENT; break;
			case "Never": node.mode = LiteGraph.NEVER; break;
			case "Always": 
			default:
				node.mode = LiteGraph.ALWAYS; break;
		}
	}

	return false;
}

LGraphCanvas.onMenuNodeColors = function(node, e, prev_menu)
{
	var values = [];
	for(var i in LGraphCanvas.node_colors)
	{
		var color = LGraphCanvas.node_colors[i];
		var value = {value:i, content:"<span style='display: block; color:"+color.color+"; background-color:"+color.bgcolor+"'>"+i+"</span>"};
		values.push(value);
	}
	LiteGraph.createContextMenu(values, {event: e, callback: inner_clicked, from: prev_menu});

	function inner_clicked(v)
	{
		if(!node) return;
		var color = LGraphCanvas.node_colors[v.value];
		if(color)
		{
			node.color = color.color;
			node.bgcolor = color.bgcolor;
			node.setDirtyCanvas(true);
		}
	}

	return false;
}

LGraphCanvas.onMenuNodeShapes = function(node,e)
{
	LiteGraph.createContextMenu(["box","round"], {event: e, callback: inner_clicked});

	function inner_clicked(v)
	{
		if(!node) return;
		node.shape = v;
		node.setDirtyCanvas(true);
	}

	return false;
}

LGraphCanvas.onMenuNodeRemove = function(node)
{
	if(node.removable == false) return;
	node.graph.remove(node);
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.onMenuNodeClone = function(node)
{
	if(node.clonable == false) return;
	var newnode = node.clone();
	if(!newnode) return;
	newnode.pos = [node.pos[0]+5,node.pos[1]+5];
	node.graph.add(newnode);
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.node_colors = {
	"red": { color:"#FAA", bgcolor:"#A44" },
	"green": { color:"#AFA", bgcolor:"#4A4" },
	"blue": { color:"#AAF", bgcolor:"#44A" },
	"white": { color:"#FFF", bgcolor:"#AAA" }
};

LGraphCanvas.prototype.getCanvasMenuOptions = function()
{
	var options = null;
	if(this.getMenuOptions)
		options = this.getMenuOptions();
	else
	{
		options = [
			{content:"Add Node", is_menu: true, callback: LGraphCanvas.onMenuAdd }
			//{content:"Collapse All", callback: LGraphCanvas.onMenuCollapseAll }
		];

		if(this._graph_stack && this._graph_stack.length > 0)
			options = [{content:"Close subgraph", callback: this.closeSubgraph.bind(this) },null].concat(options);
	}

	if(this.getExtraMenuOptions)
	{
		var extra = this.getExtraMenuOptions(this,options);
		if(extra)
			options = options.concat( extra );
	}

	return options;
}

LGraphCanvas.prototype.getNodeMenuOptions = function(node)
{
	var options = null;

	if(node.getMenuOptions)
		options = node.getMenuOptions(this);
	else
		options = [
			{content:"Inputs", is_menu: true, disabled:true, callback: LGraphCanvas.showMenuNodeInputs },
			{content:"Outputs", is_menu: true, disabled:true, callback: LGraphCanvas.showMenuNodeOutputs },
			null,
			{content:"Properties", is_menu: true, callback: LGraphCanvas.onShowMenuNodeProperties },
			null,
			{content:"Title", callback: LGraphCanvas.onShowTitleEditor },
			{content:"Mode", is_menu: true, callback: LGraphCanvas.onMenuNodeMode },
			{content:"Collapse", callback: LGraphCanvas.onMenuNodeCollapse },
			{content:"Pin", callback: LGraphCanvas.onMenuNodePin },
			{content:"Colors", is_menu: true, callback: LGraphCanvas.onMenuNodeColors },
			{content:"Shapes", is_menu: true, callback: LGraphCanvas.onMenuNodeShapes },
			null
		];

	if(node.getExtraMenuOptions)
	{
		var extra = node.getExtraMenuOptions(this);
		if(extra)
		{
			extra.push(null);
			options = extra.concat( options );
		}
	}

	if( node.clonable !== false )
			options.push({content:"Clone", callback: LGraphCanvas.onMenuNodeClone });
	if( node.removable !== false )
			options.push(null,{content:"Remove", callback: LGraphCanvas.onMenuNodeRemove });

	if(node.onGetInputs)
	{
		var inputs = node.onGetInputs();
		if(inputs && inputs.length)
			options[0].disabled = false;
	}

	if(node.onGetOutputs)
	{
		var outputs = node.onGetOutputs();
		if(outputs && outputs.length )
			options[1].disabled = false;
	}

	return options;
}

LGraphCanvas.prototype.processContextMenu = function(node, event)
{
	var that = this;
	var win = this.getCanvasWindow();

	var menu_info = null;
	var options = {event: event, callback: inner_option_clicked};

	//check if mouse is in input
	var slot = null;
	if(node)
		slot = node.getSlotInPosition( event.canvasX, event.canvasY );

	if(slot)
	{
		menu_info = slot.locked ? [ "Cannot remove" ] : { "Remove Slot": slot };
		options.title = slot.input ? slot.input.type : slot.output.type;
		if(slot.input && slot.input.type == LiteGraph.EVENT)
			options.title = "Event";
	}
	else
		menu_info = node ? this.getNodeMenuOptions(node) : this.getCanvasMenuOptions();


	//show menu
	if(!menu_info)
		return;

	var menu = LiteGraph.createContextMenu( menu_info, options, win);

	function inner_option_clicked(v,e)
	{
		if(!v)
			return;

		if(v == slot)
		{
			if(v.input)
				node.removeInput( slot.slot );
			else if(v.output)
				node.removeOutput( slot.slot );
			return;
		}

		if(v.callback)
			return v.callback.call(that, node, e, menu, that, event );
	}
}






//API *************************************************
//function roundRect(ctx, x, y, width, height, radius, radius_low) {
if(this.CanvasRenderingContext2D)
CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius, radius_low) {
  if ( radius === undefined ) {
    radius = 5;
  }

  if(radius_low === undefined)
	 radius_low  = radius;

  this.beginPath();
  this.moveTo(x + radius, y);
  this.lineTo(x + width - radius, y);
  this.quadraticCurveTo(x + width, y, x + width, y + radius);

  this.lineTo(x + width, y + height - radius_low);
  this.quadraticCurveTo(x + width, y + height, x + width - radius_low, y + height);
  this.lineTo(x + radius_low, y + height);
  this.quadraticCurveTo(x, y + height, x, y + height - radius_low);
  this.lineTo(x, y + radius);
  this.quadraticCurveTo(x, y, x + radius, y);
}

function compareObjects(a,b)
{
	for(var i in a)
		if(a[i] != b[i])
			return false;
	return true;
}
LiteGraph.compareObjects = compareObjects;

function distance(a,b)
{
	return Math.sqrt( (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) );
}
LiteGraph.distance = distance;

function colorToString(c)
{
	return "rgba(" + Math.round(c[0] * 255).toFixed() + "," + Math.round(c[1] * 255).toFixed() + "," + Math.round(c[2] * 255).toFixed() + "," + (c.length == 4 ? c[3].toFixed(2) : "1.0") + ")";
}
LiteGraph.colorToString = colorToString;

function isInsideRectangle( x,y, left, top, width, height)
{
	if (left < x && (left + width) > x &&
		top < y && (top + height) > y)
		return true;	
	return false;
}
LiteGraph.isInsideRectangle = isInsideRectangle;

//[minx,miny,maxx,maxy]
function growBounding( bounding, x,y)
{
	if(x < bounding[0])
		bounding[0] = x;
	else if(x > bounding[2])
		bounding[2] = x;

	if(y < bounding[1])
		bounding[1] = y;
	else if(y > bounding[3])
		bounding[3] = y;
}
LiteGraph.growBounding = growBounding;

//point inside boundin box
function isInsideBounding(p,bb)
{
	if (p[0] < bb[0][0] || 
		p[1] < bb[0][1] || 
		p[0] > bb[1][0] || 
		p[1] > bb[1][1])
		return false;
	return true;
}
LiteGraph.isInsideBounding = isInsideBounding;

//boundings overlap, format: [start,end]
function overlapBounding(a,b)
{
	if ( a[0] > b[2] ||
		a[1] > b[3] ||
		a[2] < b[0] ||
		a[3] < b[1])
		return false;
	return true;
}
LiteGraph.overlapBounding = overlapBounding;

//Convert a hex value to its decimal value - the inputted hex must be in the
//	format of a hex triplet - the kind we use for HTML colours. The function
//	will return an array with three values.
function hex2num(hex) {
	if(hex.charAt(0) == "#") hex = hex.slice(1); //Remove the '#' char - if there is one.
	hex = hex.toUpperCase();
	var hex_alphabets = "0123456789ABCDEF";
	var value = new Array(3);
	var k = 0;
	var int1,int2;
	for(var i=0;i<6;i+=2) {
		int1 = hex_alphabets.indexOf(hex.charAt(i));
		int2 = hex_alphabets.indexOf(hex.charAt(i+1)); 
		value[k] = (int1 * 16) + int2;
		k++;
	}
	return(value);
}

LiteGraph.hex2num = hex2num;

//Give a array with three values as the argument and the function will return
//	the corresponding hex triplet.
function num2hex(triplet) {
	var hex_alphabets = "0123456789ABCDEF";
	var hex = "#";
	var int1,int2;
	for(var i=0;i<3;i++) {
		int1 = triplet[i] / 16;
		int2 = triplet[i] % 16;

		hex += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2); 
	}
	return(hex);
}

LiteGraph.num2hex = num2hex;

/* LiteGraph GUI elements *************************************/

LiteGraph.createContextMenu = function(values, options, ref_window)
{
	options = options || {};
	this.options = options;

	//allows to create graph canvas in separate window
	ref_window = ref_window || window;

    if (!options.from)
        LiteGraph.closeAllContextMenus( ref_window );
    else {
        //closing submenus
        var menus = document.querySelectorAll(".graphcontextmenu");
        for (var key in menus) {
            if (menus[key].previousSibling == options.from)
                menus[key].closeMenu();
        }
    }

	var root = ref_window.document.createElement("div");
	root.className = "graphcontextmenu graphmenubar-panel";
	this.root = root;
	var style = root.style;

	style.minWidth = "100px";
	style.minHeight = "20px";

	style.position = "fixed";
	style.top = "100px";
	style.left = "100px";
	style.color = "#AAF";
	style.padding = "2px";
	style.borderBottom = "2px solid #AAF";
	style.backgroundColor = "#444";
	style.zIndex = 10;

	//title
	if(options.title)
	{
		var element = document.createElement("div");
		element.className = "graphcontextmenu-title";
		element.innerHTML = options.title;
		root.appendChild(element);
	}

	//avoid a context menu in a context menu
	root.addEventListener("contextmenu", function(e) { e.preventDefault(); return false; });

	for(var i in values)
	{
		var item = values[i];
		var element = ref_window.document.createElement("div");
		element.className = "graphmenu-entry";

		if(item == null)
		{
			element.className += " separator";
			root.appendChild(element);
			continue;
		}

		if(item.is_menu)
			element.className += " submenu";

		if(item.disabled)
			element.className += " disabled";

		if(item.className)
			element.className += " " + item.className;

		element.style.cursor = "pointer";
		element.dataset["value"] = typeof(item) == "string" ? item : item.value;
		element.data = item;

		var content = "";
		if(typeof(item) == "string")
			content = values.constructor == Array ? values[i] : i;
		else
			content = item.content ? item.content : i;
		if(options.allow_html)
			element.innerHTML = content;
		else
			element.innerText = content;

		element.addEventListener("click", on_click );
		root.appendChild(element);
	}

	root.addEventListener("mouseover", function(e) {
		this.mouse_inside = true;
	});

	root.addEventListener("mouseout", function(e) {
		//console.log("OUT!");
		//check if mouse leave a inner element
		var aux = e.relatedTarget || e.toElement;
		while(aux != this && aux != ref_window.document)
			aux = aux.parentNode;

		if(aux == this)
			return;
		this.mouse_inside = false;
		if(!this.block_close)
			this.closeMenu();
	});

	//insert before checking position
	ref_window.document.body.appendChild(root);

	var root_rect = root.getClientRects()[0];

	//link menus
	if(options.from)
	{
		options.from.block_close = true;
	}

	var left = options.left || 0;
	var top = options.top || 0;
	if(options.event)
	{
		left = (options.event.pageX - 10);
		top = (options.event.pageY - 10);
		if(options.left)
			left = options.left;

		var rect = ref_window.document.body.getClientRects()[0];

		if(options.from)
		{
			var parent_rect = options.from.getClientRects()[0];
			left = parent_rect.left + parent_rect.width;
		}

		
		if(left > (rect.width - root_rect.width - 10))
			left = (rect.width - root_rect.width - 10);
		if(top > (rect.height - root_rect.height - 10))
			top = (rect.height - root_rect.height - 10);
	}

	root.style.left = left + "px";
	root.style.top = top  + "px";

	function on_click(e) {
		var value = this.dataset["value"];
		var close = true;
		if(options.callback)
		{
			var ret = options.callback.call(root, this.data, e );
			if( ret !== undefined ) close = ret;
		}

		if(close)
			LiteGraph.closeAllContextMenus( ref_window );
			//root.closeMenu();
	}

	root.closeMenu = function()
	{
		if(options.from)
		{
			options.from.block_close = false;
			if(!options.from.mouse_inside)
				options.from.closeMenu();
		}
		if(this.parentNode)
			ref_window.document.body.removeChild(this);
	};

	return root;
}

LiteGraph.closeAllContextMenus = function( ref_window )
{
	ref_window = ref_window || window;

	var elements = ref_window.document.querySelectorAll(".graphcontextmenu");
	if(!elements.length) return;

	var result = [];
	for(var i = 0; i < elements.length; i++)
		result.push(elements[i]);

	for(var i in result)
		if(result[i].parentNode)
			result[i].parentNode.removeChild( result[i] );
}

LiteGraph.extendClass = function ( target, origin )
{
	for(var i in origin) //copy class properties
	{
		if(target.hasOwnProperty(i))
			continue;
		target[i] = origin[i];
	}

	if(origin.prototype) //copy prototype properties
		for(var i in origin.prototype) //only enumerables
		{
			if(!origin.prototype.hasOwnProperty(i)) 
				continue;

			if(target.prototype.hasOwnProperty(i)) //avoid overwritting existing ones
				continue;

			//copy getters 
			if(origin.prototype.__lookupGetter__(i))
				target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
			else 
				target.prototype[i] = origin.prototype[i];

			//and setters
			if(origin.prototype.__lookupSetter__(i))
				target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
		}
} 

/*
LiteGraph.createNodetypeWrapper = function( class_object )
{
	//create Nodetype object
}
//LiteGraph.registerNodeType("scene/global", LGraphGlobal );
*/

if(typeof(window) !== undefined && !window["requestAnimationFrame"] )
{
	window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
		  window.mozRequestAnimationFrame    ||
		  (function( callback ){
			window.setTimeout(callback, 1000 / 60);
		  });
}

})(this);

//basic nodes
(function(){


//Constant
function Time()
{
	this.addOutput("in ms","number");
	this.addOutput("in sec","number");
}

Time.title = "Time";
Time.desc = "Time";

Time.prototype.onExecute = function()
{
	this.setOutputData(0, this.graph.globaltime * 1000 );
	this.setOutputData(1, this.graph.globaltime  );
}

LiteGraph.registerNodeType("basic/time", Time);


//Subgraph: a node that contains a graph
function Subgraph()
{
	var that = this;
	this.size = [120,60];

	//create inner graph
	this.subgraph = new LGraph();
	this.subgraph._subgraph_node = this;
	this.subgraph._is_subgraph = true;

	this.subgraph.onGlobalInputAdded = this.onSubgraphNewGlobalInput.bind(this);
	this.subgraph.onGlobalInputRenamed = this.onSubgraphRenamedGlobalInput.bind(this);
	this.subgraph.onGlobalInputTypeChanged = this.onSubgraphTypeChangeGlobalInput.bind(this);

	this.subgraph.onGlobalOutputAdded = this.onSubgraphNewGlobalOutput.bind(this);
	this.subgraph.onGlobalOutputRenamed = this.onSubgraphRenamedGlobalOutput.bind(this);
	this.subgraph.onGlobalOutputTypeChanged = this.onSubgraphTypeChangeGlobalOutput.bind(this);
	

	this.bgcolor = "#940";
}

Subgraph.title = "Subgraph";
Subgraph.desc = "Graph inside a node";

Subgraph.prototype.onSubgraphNewGlobalInput = function(name, type)
{
	//add input to the node
	this.addInput(name, type);
}

Subgraph.prototype.onSubgraphRenamedGlobalInput = function(oldname, name)
{
	var slot = this.findInputSlot( oldname );
	if(slot == -1)
		return;
	var info = this.getInputInfo(slot);
	info.name = name;
}

Subgraph.prototype.onSubgraphTypeChangeGlobalInput = function(name, type)
{
	var slot = this.findInputSlot( name );
	if(slot == -1)
		return;
	var info = this.getInputInfo(slot);
	info.type = type;
}


Subgraph.prototype.onSubgraphNewGlobalOutput = function(name, type)
{
	//add output to the node
	this.addOutput(name, type);
}


Subgraph.prototype.onSubgraphRenamedGlobalOutput = function(oldname, name)
{
	var slot = this.findOutputSlot( oldname );
	if(slot == -1)
		return;
	var info = this.getOutputInfo(slot);
	info.name = name;
}

Subgraph.prototype.onSubgraphTypeChangeGlobalOutput = function(name, type)
{
	var slot = this.findOutputSlot( name );
	if(slot == -1)
		return;
	var info = this.getOutputInfo(slot);
	info.type = type;
}


Subgraph.prototype.getExtraMenuOptions = function(graphcanvas)
{
	var that = this;
	return [ {content:"Open", callback: 
		function() { 
			graphcanvas.openSubgraph( that.subgraph );
		}
	}];
}

Subgraph.prototype.onExecute = function()
{
	//send inputs to subgraph global inputs
	if(this.inputs)
		for(var i = 0; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var value = this.getInputData(i);
			this.subgraph.setGlobalInputData( input.name, value );
		}

	//execute
	this.subgraph.runStep();

	//send subgraph global outputs to outputs
	if(this.outputs)
		for(var i = 0; i < this.outputs.length; i++)
		{
			var output = this.outputs[i];
			var value = this.subgraph.getGlobalOutputData( output.name );
			this.setOutputData(i, value);
		}
}

Subgraph.prototype.configure = function(o)
{
	LGraphNode.prototype.configure.call(this, o);
	//this.subgraph.configure(o.graph);
}

Subgraph.prototype.serialize = function()
{
	var data = LGraphNode.prototype.serialize.call(this);
	data.subgraph = this.subgraph.serialize();
	return data;
}

Subgraph.prototype.clone = function()
{
	var node = LiteGraph.createNode(this.type);
	var data = this.serialize();
	delete data["id"];
	delete data["inputs"];
	delete data["outputs"];
	node.configure(data);
	return node;
}


LiteGraph.registerNodeType("graph/subgraph", Subgraph );


//Input for a subgraph
function GlobalInput()
{

	//random name to avoid problems with other outputs when added
	var input_name = "input_" + (Math.random()*1000).toFixed();

	this.addOutput(input_name, null );

	this.properties = { name: input_name, type: null };

	var that = this;

	Object.defineProperty( this.properties, "name", {
		get: function() { 
			return input_name;
		},
		set: function(v) {
			if(v == "")
				return;

			var info = that.getOutputInfo(0);
			if(info.name == v)
				return;
			info.name = v;
			if(that.graph)
				that.graph.renameGlobalInput(input_name, v);
			input_name = v;
		},
		enumerable: true
	});

	Object.defineProperty( this.properties, "type", {
		get: function() { return that.outputs[0].type; },
		set: function(v) { 
			that.outputs[0].type = v; 
			if(that.graph)
				that.graph.changeGlobalInputType(input_name, that.outputs[0].type);
		},
		enumerable: true
	});
}

GlobalInput.title = "Input";
GlobalInput.desc = "Input of the graph";

//When added to graph tell the graph this is a new global input
GlobalInput.prototype.onAdded = function()
{
	this.graph.addGlobalInput( this.properties.name, this.properties.type );
}

GlobalInput.prototype.onExecute = function()
{
	var name = this.properties.name;

	//read from global input
	var	data = this.graph.global_inputs[name];
	if(!data) return;

	//put through output
	this.setOutputData(0,data.value);
}

LiteGraph.registerNodeType("graph/input", GlobalInput);



//Output for a subgraph
function GlobalOutput()
{
	//random name to avoid problems with other outputs when added
	var output_name = "output_" + (Math.random()*1000).toFixed();

	this.addInput(output_name, null);

	this.properties = {name: output_name, type: null };

	var that = this;

	Object.defineProperty(this.properties, "name", {
		get: function() { 
			return output_name;
		},
		set: function(v) {
			if(v == "")
				return;

			var info = that.getInputInfo(0);
			if(info.name == v)
				return;
			info.name = v;
			if(that.graph)
				that.graph.renameGlobalOutput(output_name, v);
			output_name = v;
		},
		enumerable: true
	});

	Object.defineProperty(this.properties, "type", {
		get: function() { return that.inputs[0].type; },
		set: function(v) { 
			that.inputs[0].type = v;
			if(that.graph)
				that.graph.changeGlobalInputType( output_name, that.inputs[0].type );
		},
		enumerable: true
	});
}

GlobalOutput.title = "Ouput";
GlobalOutput.desc = "Output of the graph";

GlobalOutput.prototype.onAdded = function()
{
	var name = this.graph.addGlobalOutput( this.properties.name, this.properties.type );
}

GlobalOutput.prototype.onExecute = function()
{
	this.graph.setGlobalOutputData( this.properties.name, this.getInputData(0) );
}

LiteGraph.registerNodeType("graph/output", GlobalOutput);



//Constant
function Constant()
{
	this.addOutput("value","number");
	this.addProperty( "value", 1.0 );
	this.editable = { property:"value", type:"number" };
}

Constant.title = "Const";
Constant.desc = "Constant value";


Constant.prototype.setValue = function(v)
{
	if( typeof(v) == "string") v = parseFloat(v);
	this.properties["value"] = v;
	this.setDirtyCanvas(true);
};

Constant.prototype.onExecute = function()
{
	this.setOutputData(0, parseFloat( this.properties["value"] ) );
}

Constant.prototype.onDrawBackground = function(ctx)
{
	//show the current value
	this.outputs[0].label = this.properties["value"].toFixed(3);
}

Constant.prototype.onWidget = function(e,widget)
{
	if(widget.name == "value")
		this.setValue(widget.value);
}

LiteGraph.registerNodeType("basic/const", Constant);


//Watch a value in the editor
function Watch()
{
	this.size = [60,20];
	this.addInput("value",0,{label:""});
	this.addOutput("value",0,{label:""});
	this.addProperty( "value", "" );
}

Watch.title = "Watch";
Watch.desc = "Show value of input";

Watch.prototype.onExecute = function()
{
	this.properties.value = this.getInputData(0);
	this.setOutputData(0, this.properties.value);
}

Watch.prototype.onDrawBackground = function(ctx)
{
	//show the current value
	if(this.inputs[0] && this.properties["value"] != null)	
	{
		if (this.properties["value"].constructor === Number )
			this.inputs[0].label = this.properties["value"].toFixed(3);
		else
		{
			var str = this.properties["value"];
			if(str && str.length) //convert typed to array
				str = Array.prototype.slice.call(str).join(",");
			this.inputs[0].label = str;
		}
	}
}

LiteGraph.registerNodeType("basic/watch", Watch);


//Show value inside the debug console
function Console()
{
	this.mode = LiteGraph.ON_EVENT;
	this.size = [60,20];
	this.addProperty( "msg", "" );
	this.addInput("log", LiteGraph.EVENT);
	this.addInput("msg",0);
}

Console.title = "Console";
Console.desc = "Show value inside the console";

Console.prototype.onAction = function(action, param)
{
	if(action == "log")
		console.log( param );
	else if(action == "warn")
		console.warn( param );
	else if(action == "error")
		console.error( param );
}

Console.prototype.onExecute = function()
{
	var msg = this.getInputData(0);
	if(msg !== null)
		this.properties.msg = msg;
	console.log(msg);
}

Console.prototype.onGetInputs = function()
{
	return [["log",LiteGraph.ACTION],["warn",LiteGraph.ACTION],["error",LiteGraph.ACTION]];
}

LiteGraph.registerNodeType("basic/console", Console );


})();
//event related nodes
(function(){

//Show value inside the debug console
function DelayEvent()
{
	this.size = [60,20];
	this.addProperty( "time", 1000 );
	this.addInput("event", LiteGraph.ACTION);
	this.addOutput("on_time", LiteGraph.EVENT);

	this._pending = [];
}

DelayEvent.title = "Delay";
DelayEvent.desc = "Delays one event";

DelayEvent.prototype.onAction = function(action, param)
{
	this._pending.push([ this.properties.time, param ]);
}

DelayEvent.prototype.onExecute = function()
{
	var dt = this.graph.elapsed_time * 1000; //in ms

	for(var i = 0; i < this._pending.length; ++i)
	{
		var action = this._pending[i];
		action[0] -= dt;
		if( action[0] > 0 )
			continue;
		
		//remove
		this._pending.splice(i,1); 
		--i;

		//trigger
		this.trigger(null, action[1]);
	}
}

DelayEvent.prototype.onGetInputs = function()
{
	return [["event",LiteGraph.ACTION]];
}

LiteGraph.registerNodeType("events/delay", DelayEvent );


})();
//widgets
(function(){

	/* Button ****************/

	function WidgetButton()
	{
		this.addOutput( "clicked", LiteGraph.EVENT );
		this.addProperty( "text","" );
		this.addProperty( "font","40px Arial" );
		this.addProperty( "message", "" );
		this.size = [64,84];
	}

	WidgetButton.title = "Button";
	WidgetButton.desc = "Triggers an event";

	WidgetButton.prototype.onDrawForeground = function(ctx)
	{
		if(this.flags.collapsed)
			return;

		//ctx.font = "40px Arial";
		//ctx.textAlign = "center";
		ctx.fillStyle = "black";
		ctx.fillRect(1,1,this.size[0] - 3, this.size[1] - 3);
		ctx.fillStyle = "#AAF";
		ctx.fillRect(0,0,this.size[0] - 3, this.size[1] - 3);
		ctx.fillStyle = this.clicked ? "white" : (this.mouseOver ? "#668" : "#334");
		ctx.fillRect(1,1,this.size[0] - 4, this.size[1] - 4);

		if( this.properties.text || this.properties.text === 0 )
		{
			ctx.textAlign = "center";
			ctx.fillStyle = this.clicked ? "black" : "white";
			if( this.properties.font )
				ctx.font = this.properties.font;
			ctx.fillText(this.properties.text, this.size[0] * 0.5, this.size[1] * 0.85 );
			ctx.textAlign = "left";
		}
	}

	WidgetButton.prototype.onMouseDown = function(e, local_pos)
	{
		if(local_pos[0] > 1 && local_pos[1] > 1 && local_pos[0] < (this.size[0] - 2) && local_pos[1] < (this.size[1] - 2) )
		{
			this.clicked = true;
			this.trigger( "clicked", this.properties.message );
			return true;
		}
	}

	WidgetButton.prototype.onMouseUp = function(e)
	{
		this.clicked = false;
	}


	LiteGraph.registerNodeType("widget/button", WidgetButton );

	/* Knob ****************/

	function WidgetKnob()
	{
		this.addOutput("",'number');
		this.size = [64,84];
		this.properties = {min:0,max:1,value:0.5,wcolor:"#7AF",size:50};
	}

	WidgetKnob.title = "Knob";
	WidgetKnob.desc = "Circular controller";
	WidgetKnob.widgets = [{name:"increase",text:"+",type:"minibutton"},{name:"decrease",text:"-",type:"minibutton"}];


	WidgetKnob.prototype.onAdded = function()
	{
		this.value = (this.properties["value"] - this.properties["min"]) / (this.properties["max"] - this.properties["min"]);

		this.imgbg = this.loadImage("imgs/knob_bg.png");
		this.imgfg = this.loadImage("imgs/knob_fg.png");
	}

	WidgetKnob.prototype.onDrawImageKnob = function(ctx)
	{
		if(!this.imgfg || !this.imgfg.width) return;

		var d = this.imgbg.width*0.5;
		var scale = this.size[0] / this.imgfg.width;

		ctx.save();
			ctx.translate(0,20);
			ctx.scale(scale,scale);
			ctx.drawImage(this.imgbg,0,0);
			//ctx.drawImage(this.imgfg,0,20);

			ctx.translate(d,d);
			ctx.rotate(this.value * (Math.PI*2) * 6/8 + Math.PI * 10/8);
			//ctx.rotate(this.value * (Math.PI*2));
			ctx.translate(-d,-d);
			ctx.drawImage(this.imgfg,0,0);

		ctx.restore();

		if(this.title)
		{
			ctx.font = "bold 16px Criticized,Tahoma";
			ctx.fillStyle="rgba(100,100,100,0.8)";
			ctx.textAlign = "center";
			ctx.fillText(this.title.toUpperCase(), this.size[0] * 0.5, 18 );
			ctx.textAlign = "left";
		}
	}

	WidgetKnob.prototype.onDrawVectorKnob = function(ctx)
	{
		if(!this.imgfg || !this.imgfg.width) return;

		//circle around
		ctx.lineWidth = 1;
		ctx.strokeStyle= this.mouseOver ? "#FFF" : "#AAA";
		ctx.fillStyle="#000";
		ctx.beginPath();
		ctx.arc(this.size[0] * 0.5,this.size[1] * 0.5 + 10,this.properties.size * 0.5,0,Math.PI*2,true);
		ctx.stroke();

		if(this.value > 0)
		{
			ctx.strokeStyle=this.properties["wcolor"];
			ctx.lineWidth = (this.properties.size * 0.2);
			ctx.beginPath();
			ctx.arc(this.size[0] * 0.5,this.size[1] * 0.5 + 10,this.properties.size * 0.35,Math.PI * -0.5 + Math.PI*2 * this.value,Math.PI * -0.5,true);
			ctx.stroke();
			ctx.lineWidth = 1;
		}

		ctx.font = (this.properties.size * 0.2) + "px Arial";
		ctx.fillStyle="#AAA";
		ctx.textAlign = "center";

		var str = this.properties["value"];
		if(typeof(str) == 'number')
			str = str.toFixed(2);

		ctx.fillText(str,this.size[0] * 0.5,this.size[1]*0.65);
		ctx.textAlign = "left";
	}

	WidgetKnob.prototype.onDrawForeground = function(ctx)
	{
		this.onDrawImageKnob(ctx);
	}

	WidgetKnob.prototype.onExecute = function()
	{
		this.setOutputData(0, this.properties["value"] );

		this.boxcolor = LiteGraph.colorToString([this.value,this.value,this.value]);
	}

	WidgetKnob.prototype.onMouseDown = function(e)
	{
		if(!this.imgfg || !this.imgfg.width) return;

		//this.center = [this.imgbg.width * 0.5, this.imgbg.height * 0.5 + 20];
		//this.radius = this.imgbg.width * 0.5;
		this.center = [this.size[0] * 0.5, this.size[1] * 0.5 + 20];
		this.radius = this.size[0] * 0.5;

		if(e.canvasY - this.pos[1] < 20 || LiteGraph.distance([e.canvasX,e.canvasY],[this.pos[0] + this.center[0],this.pos[1] + this.center[1]]) > this.radius)
			return false;

		this.oldmouse = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];
		this.captureInput(true);

		/*
		var tmp = this.localToScreenSpace(0,0);
		this.trace(tmp[0] + "," + tmp[1]); */
		return true;
	}

	WidgetKnob.prototype.onMouseMove = function(e)
	{
		if(!this.oldmouse) return;

		var m = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];

		var v = this.value;
		v -= (m[1] - this.oldmouse[1]) * 0.01;
		if(v > 1.0) v = 1.0;
		else if(v < 0.0) v = 0.0;

		this.value = v;
		this.properties["value"] = this.properties["min"] + (this.properties["max"] - this.properties["min"]) * this.value;

		this.oldmouse = m;
		this.setDirtyCanvas(true);
	}

	WidgetKnob.prototype.onMouseUp = function(e)
	{
		if(this.oldmouse)
		{
			this.oldmouse = null;
			this.captureInput(false);
		}
	}

	WidgetKnob.prototype.onMouseLeave = function(e)
	{
		//this.oldmouse = null;
	}
	
	WidgetKnob.prototype.onWidget = function(e,widget)
	{
		if(widget.name=="increase")
			this.onPropertyChanged("size", this.properties.size + 10);
		else if(widget.name=="decrease")
			this.onPropertyChanged("size", this.properties.size - 10);
	}

	WidgetKnob.prototype.onPropertyChanged = function(name,value)
	{
		if(name=="wcolor")
			this.properties[name] = value;
		else if(name=="size")
		{
			value = parseInt(value);
			this.properties[name] = value;
			this.size = [value+4,value+24];
			this.setDirtyCanvas(true,true);
		}
		else if(name=="min" || name=="max" || name=="value")
		{
			this.properties[name] = parseFloat(value);
		}
		else
			return false;
		return true;
	}

	LiteGraph.registerNodeType("widget/knob", WidgetKnob);

	//Widget H SLIDER
	function WidgetHSlider()
	{
		this.size = [160,26];
		this.addOutput("",'number');
		this.properties = {wcolor:"#7AF",min:0,max:1,value:0.5};
	}

	WidgetHSlider.title = "H.Slider";
	WidgetHSlider.desc = "Linear slider controller";

	WidgetHSlider.prototype.onInit = function()
	{
		this.value = 0.5;
		this.imgfg = this.loadImage("imgs/slider_fg.png");
	}

	WidgetHSlider.prototype.onDrawVectorial = function(ctx)
	{
		if(!this.imgfg || !this.imgfg.width) return;

		//border
		ctx.lineWidth = 1;
		ctx.strokeStyle= this.mouseOver ? "#FFF" : "#AAA";
		ctx.fillStyle="#000";
		ctx.beginPath();
		ctx.rect(2,0,this.size[0]-4,20);
		ctx.stroke();

		ctx.fillStyle=this.properties["wcolor"];
		ctx.beginPath();
		ctx.rect(2+(this.size[0]-4-20)*this.value,0, 20,20);
		ctx.fill();
	}

	WidgetHSlider.prototype.onDrawImage = function(ctx)
	{
		if(!this.imgfg || !this.imgfg.width) 
			return;

		//border
		ctx.lineWidth = 1;
		ctx.fillStyle="#000";
		ctx.fillRect(2,9,this.size[0]-4,2);

		ctx.strokeStyle= "#333";
		ctx.beginPath();
		ctx.moveTo(2,9);
		ctx.lineTo(this.size[0]-4,9);
		ctx.stroke();

		ctx.strokeStyle= "#AAA";
		ctx.beginPath();
		ctx.moveTo(2,11);
		ctx.lineTo(this.size[0]-4,11);
		ctx.stroke();

		ctx.drawImage(this.imgfg, 2+(this.size[0]-4)*this.value - this.imgfg.width*0.5,-this.imgfg.height*0.5 + 10);
	},

	WidgetHSlider.prototype.onDrawForeground = function(ctx)
	{
		this.onDrawImage(ctx);
	}

	WidgetHSlider.prototype.onExecute = function()
	{
		this.properties["value"] = this.properties["min"] + (this.properties["max"] - this.properties["min"]) * this.value;
		this.setOutputData(0, this.properties["value"] );
		this.boxcolor = LiteGraph.colorToString([this.value,this.value,this.value]);
	}

	WidgetHSlider.prototype.onMouseDown = function(e)
	{
		if(e.canvasY - this.pos[1] < 0)
			return false;

		this.oldmouse = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];
		this.captureInput(true);
		return true;
	}

	WidgetHSlider.prototype.onMouseMove = function(e)
	{
		if(!this.oldmouse) return;

		var m = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];

		var v = this.value;
		var delta = (m[0] - this.oldmouse[0]);
		v += delta / this.size[0];
		if(v > 1.0) v = 1.0;
		else if(v < 0.0) v = 0.0;

		this.value = v;

		this.oldmouse = m;
		this.setDirtyCanvas(true);
	}

	WidgetHSlider.prototype.onMouseUp = function(e)
	{
		this.oldmouse = null;
		this.captureInput(false);
	}

	WidgetHSlider.prototype.onMouseLeave = function(e)
	{
		//this.oldmouse = null;
	}

	WidgetHSlider.prototype.onPropertyChanged = function(name,value)
	{
		if(name=="wcolor")
			this.properties[name] = value;
		else
			return false;
		return true;
	}

	LiteGraph.registerNodeType("widget/hslider", WidgetHSlider );


	function WidgetProgress()
	{
		this.size = [160,26];
		this.addInput("",'number');
		this.properties = {min:0,max:1,value:0,wcolor:"#AAF"};
	}

	WidgetProgress.title = "Progress";
	WidgetProgress.desc = "Shows data in linear progress";

	WidgetProgress.prototype.onExecute = function()
	{
		var v = this.getInputData(0);
		if( v != undefined )
			this.properties["value"] = v;
	}

	WidgetProgress.prototype.onDrawForeground = function(ctx)
	{
		//border
		ctx.lineWidth = 1;
		ctx.fillStyle=this.properties.wcolor;
		var v = (this.properties.value - this.properties.min) / (this.properties.max - this.properties.min);
		v = Math.min(1,v);
		v = Math.max(0,v);
		ctx.fillRect(2,2,(this.size[0]-4)*v,this.size[1]-4);
	}

	LiteGraph.registerNodeType("widget/progress", WidgetProgress);


	/*
	LiteGraph.registerNodeType("widget/kpad",{
		title: "KPad",
		desc: "bidimensional slider",
		size: [200,200],
		outputs: [["x",'number'],["y",'number']],
		properties:{x:0,y:0,borderColor:"#333",bgcolorTop:"#444",bgcolorBottom:"#000",shadowSize:1, borderRadius:2},

		createGradient: function(ctx)
		{
			this.lineargradient = ctx.createLinearGradient(0,0,0,this.size[1]);  
			this.lineargradient.addColorStop(0,this.properties["bgcolorTop"]);  
			this.lineargradient.addColorStop(1,this.properties["bgcolorBottom"]);
		},

		onDrawBackground: function(ctx)
		{
			if(!this.lineargradient)
				this.createGradient(ctx);

			ctx.lineWidth = 1;
			ctx.strokeStyle = this.properties["borderColor"];
			//ctx.fillStyle = "#ebebeb";
			ctx.fillStyle = this.lineargradient;

			ctx.shadowColor = "#000";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = this.properties["shadowSize"];
			ctx.roundRect(0,0,this.size[0],this.size[1],this.properties["shadowSize"]);
			ctx.fill();
			ctx.shadowColor = "rgba(0,0,0,0)";
			ctx.stroke();

			ctx.fillStyle = "#A00";
			ctx.fillRect(this.size[0] * this.properties["x"] - 5, this.size[1] * this.properties["y"] - 5,10,10);
		},

		onWidget: function(e,widget)
		{
			if(widget.name == "update")
			{
				this.lineargradient = null;
				this.setDirtyCanvas(true);
			}
		},

		onExecute: function()
		{
			this.setOutputData(0, this.properties["x"] );
			this.setOutputData(1, this.properties["y"] );
		},

		onMouseDown: function(e)
		{
			if(e.canvasY - this.pos[1] < 0)
				return false;

			this.oldmouse = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];
			this.captureInput(true);
			return true;
		},

		onMouseMove: function(e)
		{
			if(!this.oldmouse) return;

			var m = [ e.canvasX - this.pos[0], e.canvasY - this.pos[1] ];
			
			this.properties.x = m[0] / this.size[0];
			this.properties.y = m[1] / this.size[1];

			if(this.properties.x > 1.0) this.properties.x = 1.0;
			else if(this.properties.x < 0.0) this.properties.x = 0.0;

			if(this.properties.y > 1.0) this.properties.y = 1.0;
			else if(this.properties.y < 0.0) this.properties.y = 0.0;

			this.oldmouse = m;
			this.setDirtyCanvas(true);
		},

		onMouseUp: function(e)
		{
			if(this.oldmouse)
			{
				this.oldmouse = null;
				this.captureInput(false);
			}
		},

		onMouseLeave: function(e)
		{
			//this.oldmouse = null;
		}
	});



	LiteGraph.registerNodeType("widget/button", {
		title: "Button",
		desc: "A send command button",

		widgets: [{name:"test",text:"Test Button",type:"button"}],
		size: [100,40],
		properties:{text:"clickme",command:"",color:"#7AF",bgcolorTop:"#f0f0f0",bgcolorBottom:"#e0e0e0",fontsize:"16"},
		outputs:[["M","module"]],

		createGradient: function(ctx)
		{
			this.lineargradient = ctx.createLinearGradient(0,0,0,this.size[1]);  
			this.lineargradient.addColorStop(0,this.properties["bgcolorTop"]);  
			this.lineargradient.addColorStop(1,this.properties["bgcolorBottom"]);
		},

		drawVectorShape: function(ctx)
		{
			ctx.fillStyle = this.mouseOver ? this.properties["color"] : "#AAA";

			if(this.clicking) 
				ctx.fillStyle = "#FFF";

			ctx.strokeStyle = "#AAA";
			ctx.roundRect(5,5,this.size[0] - 10,this.size[1] - 10,4);
			ctx.stroke();

			if(this.mouseOver)
				ctx.fill();

			//ctx.fillRect(5,20,this.size[0] - 10,this.size[1] - 30);

			ctx.fillStyle = this.mouseOver ? "#000" : "#AAA";
			ctx.font = "bold " + this.properties["fontsize"] + "px Criticized,Tahoma";
			ctx.textAlign = "center";
			ctx.fillText(this.properties["text"],this.size[0]*0.5,this.size[1]*0.5 + 0.5*parseInt(this.properties["fontsize"]));
			ctx.textAlign = "left";
		},

		drawBevelShape: function(ctx)
		{
			ctx.shadowColor = "#000";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = this.properties["shadowSize"];

			if(!this.lineargradient)
				this.createGradient(ctx);

			ctx.fillStyle = this.mouseOver ? this.properties["color"] : this.lineargradient;
			if(this.clicking) 
				ctx.fillStyle = "#444";

			ctx.strokeStyle = "#FFF";
			ctx.roundRect(5,5,this.size[0] - 10,this.size[1] - 10,4);
			ctx.fill();
			ctx.shadowColor = "rgba(0,0,0,0)";
			ctx.stroke();

			ctx.fillStyle = this.mouseOver ? "#000" : "#444";
			ctx.font = "bold " + this.properties["fontsize"] + "px Century Gothic";
			ctx.textAlign = "center";
			ctx.fillText(this.properties["text"],this.size[0]*0.5,this.size[1]*0.5 + 0.40*parseInt(this.properties["fontsize"]));
			ctx.textAlign = "left";
		},

		onDrawForeground: function(ctx)
		{
			this.drawBevelShape(ctx);
		},

		clickButton: function()
		{
			var module = this.getOutputModule(0);
			if(this.properties["command"] && this.properties["command"] != "")
			{
				if (! module.executeAction(this.properties["command"]) )
					this.trace("Error executing action in other module");
			}
			else if(module && module.onTrigger)
			{
				module.onTrigger();  
			}
		},

		onMouseDown: function(e)
		{
			if(e.canvasY - this.pos[1] < 2)
				return false;
			this.clickButton();
			this.clicking = true;
			return true;
		},

		onMouseUp: function(e)
		{
			this.clicking = false;
		},

		onExecute: function()
		{
		},

		onWidget: function(e,widget)
		{
			if(widget.name == "test")
			{
				this.clickButton();
			}
		},

		onPropertyChanged: function(name,value)
		{
			this.properties[name] = value;
			return true;
		}
	});
	*/


	function WidgetText()
	{
		this.addInputs("",0);
		this.properties = { value:"...",font:"Arial", fontsize:18, color:"#AAA", align:"left", glowSize:0, decimals:1 };
	}

	WidgetText.title = "Text";
	WidgetText.desc = "Shows the input value";
	WidgetText.widgets = [{name:"resize",text:"Resize box",type:"button"},{name:"led_text",text:"LED",type:"minibutton"},{name:"normal_text",text:"Normal",type:"minibutton"}];

	WidgetText.prototype.onDrawForeground = function(ctx)
	{
		//ctx.fillStyle="#000";
		//ctx.fillRect(0,0,100,60);
		ctx.fillStyle = this.properties["color"];
		var v = this.properties["value"];

		if(this.properties["glowSize"])
		{
			ctx.shadowColor = this.properties["color"];
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = this.properties["glowSize"];
		}
		else
			ctx.shadowColor = "transparent";

		var fontsize = this.properties["fontsize"];

		ctx.textAlign = this.properties["align"];
		ctx.font = fontsize.toString() + "px " + this.properties["font"];
		this.str = typeof(v) == 'number' ? v.toFixed(this.properties["decimals"]) : v;

		if( typeof(this.str) == 'string')
		{
			var lines = this.str.split("\\n");
			for(var i in lines)
				ctx.fillText(lines[i],this.properties["align"] == "left" ? 15 : this.size[0] - 15, fontsize * -0.15 + fontsize * (parseInt(i)+1) );
		}

		ctx.shadowColor = "transparent";
		this.last_ctx = ctx;
		ctx.textAlign = "left";
	}

	WidgetText.prototype.onExecute = function()
	{
		var v = this.getInputData(0);
		if(v != null)
			this.properties["value"] = v;
		else
			this.properties["value"] = "";
		this.setDirtyCanvas(true);
	}

	WidgetText.prototype.resize = function()
	{
		if(!this.last_ctx) return;

		var lines = this.str.split("\\n");
		this.last_ctx.font = this.properties["fontsize"] + "px " + this.properties["font"];
		var max = 0;
		for(var i in lines)
		{
			var w = this.last_ctx.measureText(lines[i]).width;
			if(max < w) max = w;
		}
		this.size[0] = max + 20;
		this.size[1] = 4 + lines.length * this.properties["fontsize"];

		this.setDirtyCanvas(true);
	}

	WidgetText.prototype.onWidget = function(e,widget)
	{
		if(widget.name == "resize")
			this.resize();
		else if (widget.name == "led_text")
		{
			this.properties["font"] = "Digital";
			this.properties["glowSize"] = 4;
			this.setDirtyCanvas(true);
		}
		else if (widget.name == "normal_text")
		{
			this.properties["font"] = "Arial";
			this.setDirtyCanvas(true);
		}
	}

	WidgetText.prototype.onPropertyChanged = function(name,value)
	{
		this.properties[name] = value;
		this.str = typeof(value) == 'number' ? value.toFixed(3) : value;
		//this.resize();
		return true;
	}

	LiteGraph.registerNodeType("widget/text", WidgetText );


	function WidgetPanel()
	{
		this.size = [200,100];
		this.properties = {borderColor:"#ffffff",bgcolorTop:"#f0f0f0",bgcolorBottom:"#e0e0e0",shadowSize:2, borderRadius:3};
	}

	WidgetPanel.title =  "Panel";
	WidgetPanel.desc = "Non interactive panel";
	WidgetPanel.widgets = [{name:"update",text:"Update",type:"button"}];


	WidgetPanel.prototype.createGradient = function(ctx)
	{
		if(this.properties["bgcolorTop"] == "" || this.properties["bgcolorBottom"] == "")
		{
			this.lineargradient = 0;
			return;
		}

		this.lineargradient = ctx.createLinearGradient(0,0,0,this.size[1]);  
		this.lineargradient.addColorStop(0,this.properties["bgcolorTop"]);  
		this.lineargradient.addColorStop(1,this.properties["bgcolorBottom"]);
	}

	WidgetPanel.prototype.onDrawForeground = function(ctx)
	{
		if(this.lineargradient == null)
			this.createGradient(ctx);

		if(!this.lineargradient)
			return;

		ctx.lineWidth = 1;
		ctx.strokeStyle = this.properties["borderColor"];
		//ctx.fillStyle = "#ebebeb";
		ctx.fillStyle = this.lineargradient;

		if(this.properties["shadowSize"])
		{
			ctx.shadowColor = "#000";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = this.properties["shadowSize"];
		}
		else
			ctx.shadowColor = "transparent";

		ctx.roundRect(0,0,this.size[0]-1,this.size[1]-1,this.properties["shadowSize"]);
		ctx.fill();
		ctx.shadowColor = "transparent";
		ctx.stroke();
	}

	WidgetPanel.prototype.onWidget = function(e,widget)
	{
		if(widget.name == "update")
		{
			this.lineargradient = null;
			this.setDirtyCanvas(true);
		}
	}

	LiteGraph.registerNodeType("widget/panel", WidgetPanel );

})();
(function(){

function GamepadInput()
{
	this.addOutput("left_x_axis","number");
	this.addOutput("left_y_axis","number");
	this.properties = {};
}

GamepadInput.title = "Gamepad";
GamepadInput.desc = "gets the input of the gamepad";

GamepadInput.prototype.onExecute = function()
{
	//get gamepad
	var gamepad = this.getGamepad();

	if(this.outputs)
	{
		for(var i = 0; i < this.outputs.length; i++)
		{
			var output = this.outputs[i];
			var v = null;

			if(gamepad)
			{
				switch( output.name )
				{
					case "left_axis": v = [ gamepad.xbox.axes["lx"], gamepad.xbox.axes["ly"]]; break;
					case "right_axis": v = [ gamepad.xbox.axes["rx"], gamepad.xbox.axes["ry"]]; break;
					case "left_x_axis": v = gamepad.xbox.axes["lx"]; break;
					case "left_y_axis": v = gamepad.xbox.axes["ly"]; break;
					case "right_x_axis": v = gamepad.xbox.axes["rx"]; break;
					case "right_y_axis": v = gamepad.xbox.axes["ry"]; break;
					case "trigger_left": v = gamepad.xbox.axes["ltrigger"]; break;
					case "trigger_right": v = gamepad.xbox.axes["rtrigger"]; break;
					case "a_button": v = gamepad.xbox.buttons["a"] ? 1 : 0; break;
					case "b_button": v = gamepad.xbox.buttons["b"] ? 1 : 0; break;
					case "x_button": v = gamepad.xbox.buttons["x"] ? 1 : 0; break;
					case "y_button": v = gamepad.xbox.buttons["y"] ? 1 : 0; break;
					case "lb_button": v = gamepad.xbox.buttons["lb"] ? 1 : 0; break;
					case "rb_button": v = gamepad.xbox.buttons["rb"] ? 1 : 0; break;
					case "ls_button": v = gamepad.xbox.buttons["ls"] ? 1 : 0; break;
					case "rs_button": v = gamepad.xbox.buttons["rs"] ? 1 : 0; break;
					case "start_button": v = gamepad.xbox.buttons["start"] ? 1 : 0; break;
					case "back_button": v = gamepad.xbox.buttons["back"] ? 1 : 0; break;
					default: break;
				}
			}
			else
			{
				//if no gamepad is connected, output 0
				switch( output.name )
				{
					case "left_axis":
					case "right_axis":
						v = [0,0];
						break;
					default:
						v = 0;
				}
			}
			this.setOutputData(i,v);
		}
	}
}

GamepadInput.prototype.getGamepad = function()
{
	var getGamepads = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads; 
	if(!getGamepads)
		return null;
	var gamepads = getGamepads.call(navigator);
	var gamepad = null;

	for(var i = 0; i < 4; i++)
	{
		if (gamepads[i])
		{
			gamepad = gamepads[i];

			//xbox controller mapping
			var xbox = this.xbox_mapping;
			if(!xbox)
				xbox = this.xbox_mapping = { axes:[], buttons:{}, hat: ""};

			xbox.axes["lx"] = gamepad.axes[0];
			xbox.axes["ly"] = gamepad.axes[1];
			xbox.axes["rx"] = gamepad.axes[2];
			xbox.axes["ry"] = gamepad.axes[3];
			xbox.axes["ltrigger"] = gamepad.buttons[6].value;
			xbox.axes["rtrigger"] = gamepad.buttons[7].value;

			for(var i = 0; i < gamepad.buttons.length; i++)
			{
				//mapping of XBOX
				switch(i) //I use a switch to ensure that a player with another gamepad could play
				{
					case 0: xbox.buttons["a"] = gamepad.buttons[i].pressed; break;
					case 1: xbox.buttons["b"] = gamepad.buttons[i].pressed; break;
					case 2: xbox.buttons["x"] = gamepad.buttons[i].pressed; break;
					case 3: xbox.buttons["y"] = gamepad.buttons[i].pressed; break;
					case 4: xbox.buttons["lb"] = gamepad.buttons[i].pressed; break;
					case 5: xbox.buttons["rb"] = gamepad.buttons[i].pressed; break;
					case 6: xbox.buttons["lt"] = gamepad.buttons[i].pressed; break;
					case 7: xbox.buttons["rt"] = gamepad.buttons[i].pressed; break;
					case 8: xbox.buttons["back"] = gamepad.buttons[i].pressed; break;
					case 9: xbox.buttons["start"] = gamepad.buttons[i].pressed; break;
					case 10: xbox.buttons["ls"] = gamepad.buttons[i].pressed; break;
					case 11: xbox.buttons["rs"] = gamepad.buttons[i].pressed; break;
					case 12: if( gamepad.buttons[i].pressed) xbox.hat += "up"; break;
					case 13: if( gamepad.buttons[i].pressed) xbox.hat += "down"; break;
					case 14: if( gamepad.buttons[i].pressed) xbox.hat += "left"; break;
					case 15: if( gamepad.buttons[i].pressed) xbox.hat += "right"; break;
					case 16: xbox.buttons["home"] = gamepad.buttons[i].pressed; break;
					default:
				}
			}
			gamepad.xbox = xbox;
			return gamepad;
		}	
	}
}

GamepadInput.prototype.onDrawBackground = function(ctx)
{
	//render
}

GamepadInput.prototype.onGetOutputs = function() {
	return [
		["left_axis","vec2"],
		["right_axis","vec2"],
		["left_x_axis","number"],
		["left_y_axis","number"],
		["right_x_axis","number"],
		["right_y_axis","number"],
		["trigger_left","number"],
		["trigger_right","number"],
		["a_button","number"],
		["b_button","number"],
		["x_button","number"],
		["y_button","number"],
		["lb_button","number"],
		["rb_button","number"],
		["ls_button","number"],
		["rs_button","number"],
		["start","number"],
		["back","number"]
	];
}

LiteGraph.registerNodeType("input/gamepad", GamepadInput );

})();
(function(){

//Converter
function Converter()
{
	this.addInput("in","*");
	this.size = [60,20];
}

Converter.title = "Converter";
Converter.desc = "type A to type B";

Converter.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null)
		return;

	if(this.outputs)
		for(var i = 0; i < this.outputs.length; i++)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			var result = null;
			switch( output.name )
			{
				case "number": result = v.length ? v[0] : parseFloat(v); break;
				case "vec2": 
				case "vec3": 
				case "vec4": 
					var result = null;
					var count = 1;
					switch(output.name)
					{
						case "vec2": count = 2; break;
						case "vec3": count = 3; break;
						case "vec4": count = 4; break;
					}

					var result = new Float32Array( count );
					if( v.length )
					{
						for(var j = 0; j < v.length && j < result.length; j++)
							result[j] = v[j];
					}
					else
						result[0] = parseFloat(v);
					break;
			}
			this.setOutputData(i, result);
		}
}

Converter.prototype.onGetOutputs = function() {
	return [["number","number"],["vec2","vec2"],["vec3","vec3"],["vec4","vec4"]];
}

LiteGraph.registerNodeType("math/converter", Converter );


//Bypass
function Bypass()
{
	this.addInput("in");
	this.addOutput("out");
	this.size = [60,20];
}

Bypass.title = "Bypass";
Bypass.desc = "removes the type";

Bypass.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	this.setOutputData(0, v);
}

LiteGraph.registerNodeType("math/bypass", Bypass );



function MathRange()
{
	this.addInput("in","number",{locked:true});
	this.addOutput("out","number",{locked:true});

	this.addProperty( "in", 0 );
	this.addProperty( "in_min", 0 );
	this.addProperty( "in_max", 1 );
	this.addProperty( "out_min", 0 );
	this.addProperty( "out_max", 1 );
}

MathRange.title = "Range";
MathRange.desc = "Convert a number from one range to another";

MathRange.prototype.onExecute = function()
{
	if(this.inputs)
		for(var i = 0; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			this.properties[ input.name ] = v;
		}

	var v = this.properties["in"];
	if(v === undefined || v === null || v.constructor !== Number)
		v = 0;

	var in_min = this.properties.in_min;
	var in_max = this.properties.in_max;
	var out_min = this.properties.out_min;
	var out_max = this.properties.out_max;

	this._last_v = ((v - in_min) / (in_max - in_min)) * (out_max - out_min) + out_min;
	this.setOutputData(0, this._last_v );
}

MathRange.prototype.onDrawBackground = function(ctx)
{
	//show the current value
	if(this._last_v)
		this.outputs[0].label = this._last_v.toFixed(3);
	else
		this.outputs[0].label = "?";
}

MathRange.prototype.onGetInputs = function() {
	return [["in_min","number"],["in_max","number"],["out_min","number"],["out_max","number"]];
}

LiteGraph.registerNodeType("math/range", MathRange);



function MathRand()
{
	this.addOutput("value","number");
	this.addProperty( "min", 0 );
	this.addProperty( "max", 1 );
	this.size = [60,20];
}

MathRand.title = "Rand";
MathRand.desc = "Random number";

MathRand.prototype.onExecute = function()
{
	if(this.inputs)
		for(var i = 0; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			this.properties[input.name] = v;
		}

	var min = this.properties.min;
	var max = this.properties.max;
	this._last_v = Math.random() * (max-min) + min;
	this.setOutputData(0, this._last_v );
}

MathRand.prototype.onDrawBackground = function(ctx)
{
	//show the current value
	if(this._last_v)
		this.outputs[0].label = this._last_v.toFixed(3);
	else
		this.outputs[0].label = "?";
}

MathRand.prototype.onGetInputs = function() {
	return [["min","number"],["max","number"]];
}

LiteGraph.registerNodeType("math/rand", MathRand);

//Math clamp
function MathClamp()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
	this.addProperty( "min", 0 );
	this.addProperty( "max", 1 );
}

MathClamp.title = "Clamp";
MathClamp.desc = "Clamp number between min and max";
MathClamp.filter = "shader";

MathClamp.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;
	v = Math.max(this.properties.min,v);
	v = Math.min(this.properties.max,v);
	this.setOutputData(0, v );
}

MathClamp.prototype.getCode = function(lang)
{
	var code = "";
	if(this.isInputConnected(0))
		code += "clamp({{0}}," + this.properties.min + "," + this.properties.max + ")";
	return code;
}

LiteGraph.registerNodeType("math/clamp", MathClamp );



//Math ABS
function MathLerp()
{
	this.properties = { f: 0.5 };
	this.addInput("A","number");
	this.addInput("B","number");

	this.addOutput("out","number");
}

MathLerp.title = "Lerp";
MathLerp.desc = "Linear Interpolation";

MathLerp.prototype.onExecute = function()
{
	var v1 = this.getInputData(0);
	if(v1 == null)
		v1 = 0;
	var v2 = this.getInputData(1);
	if(v2 == null)
		v2 = 0;

	var f = this.properties.f;

	var _f = this.getInputData(2);
	if(_f !== undefined)
		f = _f;

	this.setOutputData(0, v1 * (1-f) + v2 * f );
}

MathLerp.prototype.onGetInputs = function()
{
	return [["f","number"]];
}

LiteGraph.registerNodeType("math/lerp", MathLerp);



//Math ABS
function MathAbs()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
}

MathAbs.title = "Abs";
MathAbs.desc = "Absolute";

MathAbs.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;
	this.setOutputData(0, Math.abs(v) );
}

LiteGraph.registerNodeType("math/abs", MathAbs);


//Math Floor
function MathFloor()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
}

MathFloor.title = "Floor";
MathFloor.desc = "Floor number to remove fractional part";

MathFloor.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;
	this.setOutputData(0, Math.floor(v) );
}

LiteGraph.registerNodeType("math/floor", MathFloor );


//Math frac
function MathFrac()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
}

MathFrac.title = "Frac";
MathFrac.desc = "Returns fractional part";

MathFrac.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) 
		return;
	this.setOutputData(0, v%1 );
}

LiteGraph.registerNodeType("math/frac",MathFrac);


//Math Floor
function MathSmoothStep()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
	this.properties = { A: 0, B: 1 };
}

MathSmoothStep.title = "Smoothstep";
MathSmoothStep.desc = "Smoothstep";

MathSmoothStep.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v === undefined)
		return;

	var edge0 = this.properties.A;
	var edge1 = this.properties.B;

    // Scale, bias and saturate x to 0..1 range
    v = Math.clamp((v - edge0)/(edge1 - edge0), 0.0, 1.0); 
    // Evaluate polynomial
    v = v*v*(3 - 2*v);

	this.setOutputData(0, v );
}

LiteGraph.registerNodeType("math/smoothstep", MathSmoothStep );

//Math scale
function MathScale()
{
	this.addInput("in","number",{label:""});
	this.addOutput("out","number",{label:""});
	this.size = [60,20];
	this.addProperty( "factor", 1 );
}

MathScale.title = "Scale";
MathScale.desc = "v * factor";

MathScale.prototype.onExecute = function()
{
	var value = this.getInputData(0);
	if(value != null)
		this.setOutputData(0, value * this.properties.factor );
}

LiteGraph.registerNodeType("math/scale", MathScale );


//Math clamp
function MathAverageFilter()
{
	this.addInput("in","number");
	this.addOutput("out","number");
	this.size = [60,20];
	this.addProperty( "samples", 10 );
	this._values = new Float32Array(10);
	this._current = 0;
}

MathAverageFilter.title = "Average";
MathAverageFilter.desc = "Average Filter";

MathAverageFilter.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null)
		v = 0;

	var num_samples = this._values.length;

	this._values[ this._current % num_samples ] = v;
	this._current += 1;
	if(this._current > num_samples)
		this._current = 0;

	var avr = 0;
	for(var i = 0; i < num_samples; ++i)
		avr += this._values[i];

	this.setOutputData( 0, avr / num_samples );
}

MathAverageFilter.prototype.onPropertyChanged = function( name, value )
{
	if(value < 1)
		value = 1;
	this.properties.samples = Math.round(value);
	var old = this._values;

	this._values = new Float32Array( this.properties.samples );
	if(old.length <= this._values.length )
		this._values.set(old);
	else
		this._values.set( old.subarray( 0, this._values.length ) );
}

LiteGraph.registerNodeType("math/average", MathAverageFilter );


//Math operation
function MathOperation()
{
	this.addInput("A","number");
	this.addInput("B","number");
	this.addOutput("=","number");
	this.addProperty( "A", 1 );
	this.addProperty( "B", 1 );
	this.addProperty( "OP", "+", "string", { values: MathOperation.values } );
}

MathOperation.values = ["+","-","*","/","%","^"];

MathOperation.title = "Operation";
MathOperation.desc = "Easy math operators";
MathOperation["@OP"] = { type:"enum", title: "operation", values: MathOperation.values };


MathOperation.prototype.setValue = function(v)
{
	if( typeof(v) == "string") v = parseFloat(v);
	this.properties["value"] = v;
}

MathOperation.prototype.onExecute = function()
{
	var A = this.getInputData(0);
	var B = this.getInputData(1);
	if(A!=null)
		this.properties["A"] = A;
	else
		A = this.properties["A"];

	if(B!=null)
		this.properties["B"] = B;
	else
		B = this.properties["B"];

	var result = 0;
	switch(this.properties.OP)
	{
		case '+': result = A+B; break;
		case '-': result = A-B; break;
		case 'x': 
		case 'X': 
		case '*': result = A*B; break;
		case '/': result = A/B; break;
		case '%': result = A%B; break;
		case '^': result = Math.pow(A,B); break;
		default:
			console.warn("Unknown operation: " + this.properties.OP);
	}
	this.setOutputData(0, result );
}

MathOperation.prototype.onDrawBackground = function(ctx)
{
	if(this.flags.collapsed)
		return;

	ctx.font = "40px Arial";
	ctx.fillStyle = "black";
	ctx.textAlign = "center";
	ctx.fillText(this.properties.OP, this.size[0] * 0.5, this.size[1] * 0.5 + LiteGraph.NODE_TITLE_HEIGHT );
	ctx.textAlign = "left";
}

LiteGraph.registerNodeType("math/operation", MathOperation );
 

//Math compare
function MathCompare()
{
	this.addInput( "A","number" );
	this.addInput( "B","number" );
	this.addOutput("A==B","boolean");
	this.addOutput("A!=B","boolean");
	this.addProperty( "A", 0 );
	this.addProperty( "B", 0 );
}

MathCompare.title = "Compare";
MathCompare.desc = "compares between two values";

MathCompare.prototype.onExecute = function()
{
	var A = this.getInputData(0);
	var B = this.getInputData(1);
	if(A !== undefined)
		this.properties["A"] = A;
	else
		A = this.properties["A"];

	if(B !== undefined)
		this.properties["B"] = B;
	else
		B = this.properties["B"];

	for(var i = 0, l = this.outputs.length; i < l; ++i)
	{
		var output = this.outputs[i];
		if(!output.links || !output.links.length)
			continue;
		switch( output.name )
		{
			case "A==B": value = A==B; break;
			case "A!=B": value = A!=B; break;
			case "A>B": value = A>B; break;
			case "A<B": value = A<B; break;
			case "A<=B": value = A<=B; break;
			case "A>=B": value = A>=B; break;
		}
		this.setOutputData(i, value );
	}
};

MathCompare.prototype.onGetOutputs = function()
{
	return [["A==B","boolean"],["A!=B","boolean"],["A>B","boolean"],["A<B","boolean"],["A>=B","boolean"],["A<=B","boolean"]];
}

LiteGraph.registerNodeType("math/compare",MathCompare);

function MathCondition()
{
	this.addInput("A","number");
	this.addInput("B","number");
	this.addOutput("out","boolean");
	this.addProperty( "A", 1 );
	this.addProperty( "B", 1 );
	this.addProperty( "OP", ">", "string", { values: MathCondition.values } );

	this.size = [60,40];
}

MathCondition.values = [">","<","==","!=","<=",">="];
MathCondition["@OP"] = { type:"enum", title: "operation", values: MathCondition.values };

MathCondition.title = "Condition";
MathCondition.desc = "evaluates condition between A and B";

MathCondition.prototype.onExecute = function()
{
	var A = this.getInputData(0);
	if(A === undefined)
		A = this.properties.A;
	else
		this.properties.A = A;

	var B = this.getInputData(1);
	if(B === undefined)
		B = this.properties.B;
	else
		this.properties.B = B;
		
	var result = true;
	switch(this.properties.OP)
	{
		case ">": result = A>B; break;
		case "<": result = A<B; break;
		case "==": result = A==B; break;
		case "!=": result = A!=B; break;
		case "<=": result = A<=B; break;
		case ">=": result = A>=B; break;
	}

	this.setOutputData(0, result );
}

LiteGraph.registerNodeType("math/condition", MathCondition);


function MathAccumulate()
{
	this.addInput("inc","number");
	this.addOutput("total","number");
	this.addProperty( "increment", 1 );
	this.addProperty( "value", 0 );
}

MathAccumulate.title = "Accumulate";
MathAccumulate.desc = "Increments a value every time";

MathAccumulate.prototype.onExecute = function()
{
	if(this.properties.value === null)
		this.properties.value = 0;

	var inc = this.getInputData(0);
	if(inc !== null)
		this.properties.value += inc;
	else
		this.properties.value += this.properties.increment;
	this.setOutputData(0, this.properties.value );
}

LiteGraph.registerNodeType("math/accumulate", MathAccumulate);

//Math Trigonometry
function MathTrigonometry()
{
	this.addInput("v","number");
	this.addOutput("sin","number");

	this.addProperty( "amplitude", 1 );
	this.addProperty( "offset", 0 );
	this.bgImageUrl = "nodes/imgs/icon-sin.png";
}

MathTrigonometry.title = "Trigonometry";
MathTrigonometry.desc = "Sin Cos Tan";
MathTrigonometry.filter = "shader";

MathTrigonometry.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null)
		v = 0;
	var amplitude = this.properties["amplitude"];
	var slot = this.findInputSlot("amplitude");
	if(slot != -1)
		amplitude = this.getInputData(slot);
	var offset = this.properties["offset"];
	slot = this.findInputSlot("offset");
	if(slot != -1)
		offset = this.getInputData(slot);

	for(var i = 0, l = this.outputs.length; i < l; ++i)
	{
		var output = this.outputs[i];
		switch( output.name )
		{
			case "sin": value = Math.sin(v); break;
			case "cos": value = Math.cos(v); break;
			case "tan": value = Math.tan(v); break;
			case "asin": value = Math.asin(v); break;
			case "acos": value = Math.acos(v); break;
			case "atan": value = Math.atan(v); break;
		}
		this.setOutputData(i, amplitude * value + offset);
	}
}

MathTrigonometry.prototype.onGetInputs = function()
{
	return [["v","number"],["amplitude","number"],["offset","number"]];
}


MathTrigonometry.prototype.onGetOutputs = function()
{
	return [["sin","number"],["cos","number"],["tan","number"],["asin","number"],["acos","number"],["atan","number"]];
}


LiteGraph.registerNodeType("math/trigonometry", MathTrigonometry );



//math library for safe math operations without eval
if(window.math)
{
	function MathFormula()
	{
		this.addInputs("x","number");
		this.addInputs("y","number");
		this.addOutputs("","number");
		this.properties = {x:1.0, y:1.0, formula:"x+y"};
	}

	MathFormula.title = "Formula";
	MathFormula.desc = "Compute safe formula";
		
	MathFormula.prototype.onExecute = function()
	{
		var x = this.getInputData(0);
		var y = this.getInputData(1);
		if(x != null)
			this.properties["x"] = x;
		else
			x = this.properties["x"];

		if(y!=null)
			this.properties["y"] = y;
		else
			y = this.properties["y"];

		var f = this.properties["formula"];
		var value = math.eval(f,{x:x,y:y,T: this.graph.globaltime });
		this.setOutputData(0, value );
	}

	MathFormula.prototype.onDrawBackground = function()
	{
		var f = this.properties["formula"];
		this.outputs[0].label = f;
	}

	MathFormula.prototype.onGetOutputs = function()
	{
		return [["A-B","number"],["A*B","number"],["A/B","number"]];
	}

	LiteGraph.registerNodeType("math/formula", MathFormula );
}


function Math3DVec2ToXYZ()
{
	this.addInput("vec2","vec2");
	this.addOutput("x","number");
	this.addOutput("y","number");
}

Math3DVec2ToXYZ.title = "Vec2->XY";
Math3DVec2ToXYZ.desc = "vector 2 to components";

Math3DVec2ToXYZ.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;

	this.setOutputData( 0, v[0] );
	this.setOutputData( 1, v[1] );
}

LiteGraph.registerNodeType("math3d/vec2-to-xyz", Math3DVec2ToXYZ );


function Math3DXYToVec2()
{
	this.addInputs([["x","number"],["y","number"]]);
	this.addOutput("vec2","vec2");
	this.properties = {x:0, y:0};
	this._data = new Float32Array(2);
}

Math3DXYToVec2.title = "XY->Vec2";
Math3DXYToVec2.desc = "components to vector2";

Math3DXYToVec2.prototype.onExecute = function()
{
	var x = this.getInputData(0);
	if(x == null) x = this.properties.x;
	var y = this.getInputData(1);
	if(y == null) y = this.properties.y;

	var data = this._data;
	data[0] = x;
	data[1] = y;

	this.setOutputData( 0, data );
}

LiteGraph.registerNodeType("math3d/xy-to-vec2", Math3DXYToVec2 );




function Math3DVec3ToXYZ()
{
	this.addInput("vec3","vec3");
	this.addOutput("x","number");
	this.addOutput("y","number");
	this.addOutput("z","number");
}

Math3DVec3ToXYZ.title = "Vec3->XYZ";
Math3DVec3ToXYZ.desc = "vector 3 to components";

Math3DVec3ToXYZ.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;

	this.setOutputData( 0, v[0] );
	this.setOutputData( 1, v[1] );
	this.setOutputData( 2, v[2] );
}

LiteGraph.registerNodeType("math3d/vec3-to-xyz", Math3DVec3ToXYZ );


function Math3DXYZToVec3()
{
	this.addInputs([["x","number"],["y","number"],["z","number"]]);
	this.addOutput("vec3","vec3");
	this.properties = {x:0, y:0, z:0};
	this._data = new Float32Array(3);
}

Math3DXYZToVec3.title = "XYZ->Vec3";
Math3DXYZToVec3.desc = "components to vector3";

Math3DXYZToVec3.prototype.onExecute = function()
{
	var x = this.getInputData(0);
	if(x == null) x = this.properties.x;
	var y = this.getInputData(1);
	if(y == null) y = this.properties.y;
	var z = this.getInputData(2);
	if(z == null) z = this.properties.z;

	var data = this._data;
	data[0] = x;
	data[1] = y;
	data[2] = z;

	this.setOutputData( 0, data );
}

LiteGraph.registerNodeType("math3d/xyz-to-vec3", Math3DXYZToVec3 );



function Math3DVec4ToXYZW()
{
	this.addInput("vec4","vec4");
	this.addOutput("x","number");
	this.addOutput("y","number");
	this.addOutput("z","number");
	this.addOutput("w","number");
}

Math3DVec4ToXYZW.title = "Vec4->XYZW";
Math3DVec4ToXYZW.desc = "vector 4 to components";

Math3DVec4ToXYZW.prototype.onExecute = function()
{
	var v = this.getInputData(0);
	if(v == null) return;

	this.setOutputData( 0, v[0] );
	this.setOutputData( 1, v[1] );
	this.setOutputData( 2, v[2] );
	this.setOutputData( 3, v[3] );
}

LiteGraph.registerNodeType("math3d/vec4-to-xyzw", Math3DVec4ToXYZW );


function Math3DXYZWToVec4()
{
	this.addInputs([["x","number"],["y","number"],["z","number"],["w","number"]]);
	this.addOutput("vec4","vec4");
	this.properties = {x:0, y:0, z:0, w:0};
	this._data = new Float32Array(4);
}

Math3DXYZWToVec4.title = "XYZW->Vec4";
Math3DXYZWToVec4.desc = "components to vector4";

Math3DXYZWToVec4.prototype.onExecute = function()
{
	var x = this.getInputData(0);
	if(x == null) x = this.properties.x;
	var y = this.getInputData(1);
	if(y == null) y = this.properties.y;
	var z = this.getInputData(2);
	if(z == null) z = this.properties.z;
	var w = this.getInputData(3);
	if(w == null) w = this.properties.w;

	var data = this._data;
	data[0] = x;
	data[1] = y;
	data[2] = z;
	data[3] = w;

	this.setOutputData( 0, data );
}

LiteGraph.registerNodeType("math3d/xyzw-to-vec4", Math3DXYZWToVec4 );




//if glMatrix is installed...
if(window.glMatrix) 
{

	function Math3DQuaternion()
	{
		this.addOutput("quat","quat");
		this.properties = { x:0, y:0, z:0, w: 1 };
		this._value = quat.create();
	}

	Math3DQuaternion.title = "Quaternion";
	Math3DQuaternion.desc = "quaternion";

	Math3DQuaternion.prototype.onExecute = function()
	{
		this._value[0] = this.properties.x;
		this._value[1] = this.properties.y;
		this._value[2] = this.properties.z;
		this._value[3] = this.properties.w;
		this.setOutputData( 0, this._value );
	}

	LiteGraph.registerNodeType("math3d/quaternion", Math3DQuaternion );


	function Math3DRotation()
	{
		this.addInputs([["degrees","number"],["axis","vec3"]]);
		this.addOutput("quat","quat");
		this.properties = { angle:90.0, axis: vec3.fromValues(0,1,0) };

		this._value = quat.create();
	}

	Math3DRotation.title = "Rotation";
	Math3DRotation.desc = "quaternion rotation";

	Math3DRotation.prototype.onExecute = function()
	{
		var angle = this.getInputData(0);
		if(angle == null) angle = this.properties.angle;
		var axis = this.getInputData(1);
		if(axis == null) axis = this.properties.axis;

		var R = quat.setAxisAngle( this._value, axis, angle * 0.0174532925 );
		this.setOutputData( 0, R );
	}


	LiteGraph.registerNodeType("math3d/rotation", Math3DRotation );
	

	//Math3D rotate vec3
	function Math3DRotateVec3()
	{
		this.addInputs([["vec3","vec3"],["quat","quat"]]);
		this.addOutput("result","vec3");
		this.properties = { vec: [0,0,1] };
	}

	Math3DRotateVec3.title = "Rot. Vec3";
	Math3DRotateVec3.desc = "rotate a point";

	Math3DRotateVec3.prototype.onExecute = function()
	{
		var vec = this.getInputData(0);
		if(vec == null) vec = this.properties.vec;
		var quat = this.getInputData(1);
		if(quat == null)
			this.setOutputData(vec);
		else
			this.setOutputData( 0, vec3.transformQuat( vec3.create(), vec, quat ) );
	}

	LiteGraph.registerNodeType("math3d/rotate_vec3", Math3DRotateVec3);



	function Math3DMultQuat()
	{
		this.addInputs( [["A","quat"],["B","quat"]] );
		this.addOutput( "A*B","quat" );

		this._value = quat.create();
	}

	Math3DMultQuat.title = "Mult. Quat";
	Math3DMultQuat.desc = "rotate quaternion";

	Math3DMultQuat.prototype.onExecute = function()
	{
		var A = this.getInputData(0);
		if(A == null) return;
		var B = this.getInputData(1);
		if(B == null) return;

		var R = quat.multiply( this._value, A, B );
		this.setOutputData( 0, R );
	}

	LiteGraph.registerNodeType("math3d/mult-quat", Math3DMultQuat );


	function Math3DQuatSlerp()
	{
		this.addInputs( [["A","quat"],["B","quat"],["factor","number"]] );
		this.addOutput( "slerp","quat" );
		this.addProperty( "factor", 0.5 );

		this._value = quat.create();
	}

	Math3DQuatSlerp.title = "Quat Slerp";
	Math3DQuatSlerp.desc = "quaternion spherical interpolation";

	Math3DQuatSlerp.prototype.onExecute = function()
	{
		var A = this.getInputData(0);
		if(A == null)
			return;
		var B = this.getInputData(1);
		if(B == null)
			return;
		var factor = this.properties.factor;
		if( this.getInputData(2) != null )
			factor = this.getInputData(2);

		var R = quat.slerp( this._value, A, B, factor );
		this.setOutputData( 0, R );
	}

	LiteGraph.registerNodeType("math3d/quat-slerp", Math3DQuatSlerp );

} //glMatrix

})();
function Selector()
{
	this.addInput("sel","boolean");
	this.addOutput("value","number");
	this.properties = { A:0, B:1 };
	this.size = [60,20];
}

Selector.title = "Selector";
Selector.desc = "outputs A if selector is true, B if selector is false";

Selector.prototype.onExecute = function()
{
	var cond = this.getInputData(0);
	if(cond === undefined)
		return;

	for(var i = 1; i < this.inputs.length; i++)
	{
		var input = this.inputs[i];
		var v = this.getInputData(i);
		if(v === undefined)
			continue;
		this.properties[input.name] = v;
	}

	var A = this.properties.A;
	var B = this.properties.B;
	this.setOutputData(0, cond ? A : B );
}

Selector.prototype.onGetInputs = function() {
	return [["A",0],["B",0]];
}

LiteGraph.registerNodeType("logic/selector", Selector);


(function(){




function GraphicsImage()
{
	this.inputs = [];
	this.addOutput("frame","image");
	this.properties = {"url":""};
}

GraphicsImage.title = "Image";
GraphicsImage.desc = "Image loader";
GraphicsImage.widgets = [{name:"load",text:"Load",type:"button"}];

GraphicsImage.supported_extensions = ["jpg","jpeg","png","gif"];

GraphicsImage.prototype.onAdded = function()
{
	if(this.properties["url"] != "" && this.img == null)
	{
		this.loadImage( this.properties["url"] );
	}
}

GraphicsImage.prototype.onDrawBackground = function(ctx)
{
	if(this.img && this.size[0] > 5 && this.size[1] > 5)
		ctx.drawImage(this.img, 0,0,this.size[0],this.size[1]);
}


GraphicsImage.prototype.onExecute = function()
{
	if(!this.img)
		this.boxcolor = "#000";
	if(this.img && this.img.width)
		this.setOutputData(0,this.img);
	else
		this.setOutputData(0,null);
	if(this.img && this.img.dirty)
		this.img.dirty = false;
}

GraphicsImage.prototype.onPropertyChanged = function(name,value)
{
	this.properties[name] = value;
	if (name == "url" && value != "")
		this.loadImage(value);

	return true;
}

GraphicsImage.prototype.loadImage = function( url, callback )
{
	if(url == "")
	{
		this.img = null;
		return;
	}

	this.img = document.createElement("img");

	if(url.substr(0,7) == "http://")
	{
		if(LiteGraph.proxy) //proxy external files
			url = LiteGraph.proxy + url.substr(7);
	}

	this.img.src = url;
	this.boxcolor = "#F95";
	var that = this;
	this.img.onload = function()
	{
		if(callback)
			callback(this);
		that.trace("Image loaded, size: " + that.img.width + "x" + that.img.height );
		this.dirty = true;
		that.boxcolor = "#9F9";
		that.setDirtyCanvas(true);
	}
}

GraphicsImage.prototype.onWidget = function(e,widget)
{
	if(widget.name == "load")
	{
		this.loadImage(this.properties["url"]);
	}
}

GraphicsImage.prototype.onDropFile = function(file)
{
	var that = this;
	if(this._url)
		URL.revokeObjectURL( this._url );
	this._url = URL.createObjectURL( file );
	this.properties.url = this._url;
	this.loadImage( this._url, function(img){
		that.size[1] = (img.height / img.width) * that.size[0];
	});
}

LiteGraph.registerNodeType("graphics/image", GraphicsImage);



function ColorPalette()
{
	this.addInput("f","number");
	this.addOutput("Color","color");
	this.properties = {colorA:"#444444",colorB:"#44AAFF",colorC:"#44FFAA",colorD:"#FFFFFF"};

}

ColorPalette.title = "Palette";
ColorPalette.desc = "Generates a color";

ColorPalette.prototype.onExecute = function()
{
	var c = [];

	if (this.properties.colorA != null)
		c.push( hex2num( this.properties.colorA ) );
	if (this.properties.colorB != null)
		c.push( hex2num( this.properties.colorB ) );
	if (this.properties.colorC != null)
		c.push( hex2num( this.properties.colorC ) );
	if (this.properties.colorD != null)
		c.push( hex2num( this.properties.colorD ) );

	var f = this.getInputData(0);
	if(f == null) f = 0.5;
	if (f > 1.0)
		f = 1.0;
	else if (f < 0.0)
		f = 0.0;

	if(c.length == 0)
		return;

	var result = [0,0,0];
	if(f == 0)
		result = c[0];
	else if(f == 1)
		result = c[ c.length - 1];
	else
	{
		var pos = (c.length - 1)* f;
		var c1 = c[ Math.floor(pos) ];
		var c2 = c[ Math.floor(pos)+1 ];
		var t = pos - Math.floor(pos);
		result[0] = c1[0] * (1-t) + c2[0] * (t);
		result[1] = c1[1] * (1-t) + c2[1] * (t);
		result[2] = c1[2] * (1-t) + c2[2] * (t);
	}

	/*
	c[0] = 1.0 - Math.abs( Math.sin( 0.1 * reModular.getTime() * Math.PI) );
	c[1] = Math.abs( Math.sin( 0.07 * reModular.getTime() * Math.PI) );
	c[2] = Math.abs( Math.sin( 0.01 * reModular.getTime() * Math.PI) );
	*/

	for(var i in result)
		result[i] /= 255;
	
	this.boxcolor = colorToString(result);
	this.setOutputData(0, result);
}


LiteGraph.registerNodeType("color/palette", ColorPalette );


function ImageFrame()
{
	this.addInput("","image");
	this.size = [200,200];
}

ImageFrame.title = "Frame";
ImageFrame.desc = "Frame viewerew";
ImageFrame.widgets = [{name:"resize",text:"Resize box",type:"button"},{name:"view",text:"View Image",type:"button"}];


ImageFrame.prototype.onDrawBackground = function(ctx)
{
	if(this.frame)
		ctx.drawImage(this.frame, 0,0,this.size[0],this.size[1]);
}

ImageFrame.prototype.onExecute = function()
{
	this.frame = this.getInputData(0);
	this.setDirtyCanvas(true);
}

ImageFrame.prototype.onWidget = function(e,widget)
{
	if(widget.name == "resize" && this.frame)
	{
		var width = this.frame.width;
		var height = this.frame.height;

		if(!width && this.frame.videoWidth != null )
		{
			width = this.frame.videoWidth;
			height = this.frame.videoHeight;
		}

		if(width && height)
			this.size = [width, height];
		this.setDirtyCanvas(true,true);
	}
	else if(widget.name == "view")
		this.show();
}

ImageFrame.prototype.show = function()
{
	//var str = this.canvas.toDataURL("image/png");
	if(showElement && this.frame)
		showElement(this.frame);
}


LiteGraph.registerNodeType("graphics/frame", ImageFrame );



/*
LiteGraph.registerNodeType("visualization/graph", {
		desc: "Shows a graph of the inputs",

		inputs: [["",0],["",0],["",0],["",0]],
		size: [200,200],
		properties: {min:-1,max:1,bgColor:"#000"},
		onDrawBackground: function(ctx)
		{
			var colors = ["#FFF","#FAA","#AFA","#AAF"];

			if(this.properties.bgColor != null && this.properties.bgColor != "")
			{
				ctx.fillStyle="#000";
				ctx.fillRect(2,2,this.size[0] - 4, this.size[1]-4);
			}

			if(this.data)
			{
				var min = this.properties["min"];
				var max = this.properties["max"];

				for(var i in this.data)
				{
					var data = this.data[i];
					if(!data) continue;

					if(this.getInputInfo(i) == null) continue;

					ctx.strokeStyle = colors[i];
					ctx.beginPath();

					var d = data.length / this.size[0];
					for(var j = 0; j < data.length; j += d)
					{
						var value = data[ Math.floor(j) ];
						value = (value - min) / (max - min);
						if (value > 1.0) value = 1.0;
						else if(value < 0) value = 0;

						if(j == 0)
							ctx.moveTo( j / d, (this.size[1] - 5) - (this.size[1] - 10) * value);
						else
							ctx.lineTo( j / d, (this.size[1] - 5) - (this.size[1] - 10) * value);
					}

					ctx.stroke();
				}
			}

			//ctx.restore();
		},

		onExecute: function()
		{
			if(!this.data) this.data = [];

			for(var i in this.inputs)
			{
				var value = this.getInputData(i);

				if(typeof(value) == "number")
				{
					value = value ? value : 0;
					if(!this.data[i])
						this.data[i] = [];
					this.data[i].push(value);

					if(this.data[i].length > (this.size[1] - 4))
						this.data[i] = this.data[i].slice(1,this.data[i].length);
				}
				else
					this.data[i] = value;
			}

			if(this.data.length)
				this.setDirtyCanvas(true);
		}
	});
*/

function ImageFade()
{
	this.addInputs([["img1","image"],["img2","image"],["fade","number"]]);
	this.addInput("","image");
	this.properties = {fade:0.5,width:512,height:512};
}

ImageFade.title = "Image fade";
ImageFade.desc = "Fades between images";
ImageFade.widgets = [{name:"resizeA",text:"Resize to A",type:"button"},{name:"resizeB",text:"Resize to B",type:"button"}];

ImageFade.prototype.onAdded = function()
{
	this.createCanvas();
	var ctx = this.canvas.getContext("2d");
	ctx.fillStyle = "#000";
	ctx.fillRect(0,0,this.properties["width"],this.properties["height"]);
}

ImageFade.prototype.createCanvas = function()
{
	this.canvas = document.createElement("canvas");
	this.canvas.width = this.properties["width"];
	this.canvas.height = this.properties["height"];
}

ImageFade.prototype.onExecute = function()
{
	var ctx = this.canvas.getContext("2d");
	this.canvas.width = this.canvas.width;

	var A = this.getInputData(0);
	if (A != null)
	{
		ctx.drawImage(A,0,0,this.canvas.width, this.canvas.height);
	}

	var fade = this.getInputData(2);
	if(fade == null)
		fade = this.properties["fade"];
	else
		this.properties["fade"] = fade;

	ctx.globalAlpha = fade;
	var B = this.getInputData(1);
	if (B != null)
	{
		ctx.drawImage(B,0,0,this.canvas.width, this.canvas.height);
	}
	ctx.globalAlpha = 1.0;

	this.setOutputData(0,this.canvas);
	this.setDirtyCanvas(true);
}

LiteGraph.registerNodeType("graphics/imagefade", ImageFade);



function ImageCrop()
{
	this.addInput("","image");
	this.addOutput("","image");
	this.properties = {width:256,height:256,x:0,y:0,scale:1.0 };
	this.size = [50,20];
}

ImageCrop.title = "Crop";
ImageCrop.desc = "Crop Image";

ImageCrop.prototype.onAdded = function()
{
	this.createCanvas();
}

ImageCrop.prototype.createCanvas = function()
{
	this.canvas = document.createElement("canvas");
	this.canvas.width = this.properties["width"];
	this.canvas.height = this.properties["height"];
}

ImageCrop.prototype.onExecute = function()
{
	var input = this.getInputData(0);
	if(!input)
		return;

	if(input.width)
	{
		var ctx = this.canvas.getContext("2d");

		ctx.drawImage(input, -this.properties["x"],-this.properties["y"], input.width * this.properties["scale"], input.height * this.properties["scale"]);
		this.setOutputData(0,this.canvas);
	}
	else
		this.setOutputData(0,null);
}

ImageCrop.prototype.onDrawBackground = function(ctx)
{
	if(this.flags.collapsed)
		return;
	if(this.canvas)
		ctx.drawImage( this.canvas, 0,0,this.canvas.width,this.canvas.height, 0,0, this.size[0], this.size[1] );
}

ImageCrop.prototype.onPropertyChanged = function(name,value)
{
	this.properties[name] = value;

	if(name == "scale")
	{
		this.properties[name] = parseFloat(value);
		if(this.properties[name] == 0)
		{
			this.trace("Error in scale");
			this.properties[name] = 1.0;
		}
	}
	else
		this.properties[name] = parseInt(value);

	this.createCanvas();

	return true;
}

LiteGraph.registerNodeType("graphics/cropImage", ImageCrop );


function ImageVideo()
{
	this.addInput("t","number");
	this.addOutputs([["frame","image"],["t","number"],["d","number"]]);
	this.properties = {"url":""};
}

ImageVideo.title = "Video";
ImageVideo.desc = "Video playback";
ImageVideo.widgets = [{name:"play",text:"PLAY",type:"minibutton"},{name:"stop",text:"STOP",type:"minibutton"},{name:"demo",text:"Demo video",type:"button"},{name:"mute",text:"Mute video",type:"button"}];

ImageVideo.prototype.onExecute = function()
{
	if(!this.properties.url)
		return;

	if(this.properties.url != this._video_url)
		this.loadVideo(this.properties.url);

	if(!this._video || this._video.width == 0)
		return;

	var t = this.getInputData(0);
	if(t && t >= 0 && t <= 1.0)
	{
		this._video.currentTime = t * this._video.duration;
		this._video.pause();
	}

	this._video.dirty = true;
	this.setOutputData(0,this._video);
	this.setOutputData(1,this._video.currentTime);
	this.setOutputData(2,this._video.duration);
	this.setDirtyCanvas(true);
}

ImageVideo.prototype.onStart = function()
{
	this.play();
}

ImageVideo.prototype.onStop = function()
{
	this.stop();
}

ImageVideo.prototype.loadVideo = function(url)
{
	this._video_url = url;

	this._video = document.createElement("video");
	this._video.src = url;
	this._video.type = "type=video/mp4";

	this._video.muted = true;
	this._video.autoplay = true;

	var that = this;
	this._video.addEventListener("loadedmetadata",function(e) {
		//onload
		that.trace("Duration: " + this.duration + " seconds");
		that.trace("Size: " + this.videoWidth + "," + this.videoHeight);
		that.setDirtyCanvas(true);
		this.width = this.videoWidth;
		this.height = this.videoHeight;
	});
	this._video.addEventListener("progress",function(e) {
		//onload
		//that.trace("loading...");
	});
	this._video.addEventListener("error",function(e) {
		console.log("Error loading video: " + this.src);
		that.trace("Error loading video: " + this.src);
		if (this.error) {
		 switch (this.error.code) {
		   case this.error.MEDIA_ERR_ABORTED:
			  that.trace("You stopped the video.");
			  break;
		   case this.error.MEDIA_ERR_NETWORK:
			  that.trace("Network error - please try again later.");
			  break;
		   case this.error.MEDIA_ERR_DECODE:
			  that.trace("Video is broken..");
			  break;
		   case this.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
			  that.trace("Sorry, your browser can't play this video.");
			  break;
		 }
		}
	});

	this._video.addEventListener("ended",function(e) {
		that.trace("Ended.");
		this.play(); //loop
	});

	//document.body.appendChild(this.video);
}

ImageVideo.prototype.onPropertyChanged = function(name,value)
{
	this.properties[name] = value;
	if (name == "url" && value != "")
		this.loadVideo(value);

	return true;
}

ImageVideo.prototype.play = function()
{
	if(this._video)
		this._video.play();
}

ImageVideo.prototype.playPause = function()
{
	if(!this._video)
		return;
	if(this._video.paused)
		this.play();
	else
		this.pause();
}

ImageVideo.prototype.stop = function()
{
	if(!this._video)
		return;
	this._video.pause();
	this._video.currentTime = 0;
}

ImageVideo.prototype.pause = function()
{
	if(!this._video)
		return;
	this.trace("Video paused");
	this._video.pause();
}

ImageVideo.prototype.onWidget = function(e,widget)
{
	/*
	if(widget.name == "demo")
	{
		this.loadVideo();
	}
	else if(widget.name == "play")
	{
		if(this._video)
			this.playPause();
	}
	if(widget.name == "stop")
	{
		this.stop();
	}
	else if(widget.name == "mute")
	{
		if(this._video)
			this._video.muted = !this._video.muted;
	}
	*/
}

LiteGraph.registerNodeType("graphics/video", ImageVideo );


// Texture Webcam *****************************************
function ImageWebcam()
{
	this.addOutput("Webcam","image");
	this.properties = {};
}

ImageWebcam.title = "Webcam";
ImageWebcam.desc = "Webcam image";


ImageWebcam.prototype.openStream = function()
{
	//Vendor prefixes hell
	navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
	window.URL = window.URL || window.webkitURL;

	if (!navigator.getUserMedia) {
	  //console.log('getUserMedia() is not supported in your browser, use chrome and enable WebRTC from about://flags');
	  return;
	}

	this._waiting_confirmation = true;

	// Not showing vendor prefixes.
	navigator.getUserMedia({video: true}, this.streamReady.bind(this), onFailSoHard);		

	var that = this;
	function onFailSoHard(e) {
		console.log('Webcam rejected', e);
		that._webcam_stream = false;
		that.box_color = "red";
	};
}

ImageWebcam.prototype.onRemoved = function()
{
	if(this._webcam_stream)
	{
		this._webcam_stream.stop();
		this._webcam_stream = null;
		this._video = null;
	}
}

ImageWebcam.prototype.streamReady = function(localMediaStream)
{
	this._webcam_stream = localMediaStream;
	//this._waiting_confirmation = false;

	var video = this._video;
	if(!video)
	{
		video = document.createElement("video");
		video.autoplay = true;
		video.src = window.URL.createObjectURL(localMediaStream);
		this._video = video;
		//document.body.appendChild( video ); //debug
		//when video info is loaded (size and so)
		video.onloadedmetadata = function(e) {
			// Ready to go. Do some stuff.
			console.log(e);
		};
	}
},

ImageWebcam.prototype.onExecute = function()
{
	if(this._webcam_stream == null && !this._waiting_confirmation)
		this.openStream();

	if(!this._video || !this._video.videoWidth) return;

	this._video.width = this._video.videoWidth;
	this._video.height = this._video.videoHeight;
	this.setOutputData(0, this._video);
}

ImageWebcam.prototype.getExtraMenuOptions = function(graphcanvas)
{
	var that = this;
	var txt = !that.properties.show ? "Show Frame" : "Hide Frame";
	return [ {content: txt, callback: 
		function() { 
			that.properties.show = !that.properties.show;
		}
	}];
}

ImageWebcam.prototype.onDrawBackground = function(ctx)
{
	if(this.flags.collapsed || this.size[1] <= 20 || !this.properties.show)
		return;

	if(!this._video)
		return;

	//render to graph canvas
	ctx.save();
	ctx.drawImage(this._video, 0, 0, this.size[0], this.size[1]);
	ctx.restore();
}

LiteGraph.registerNodeType("graphics/webcam", ImageWebcam );


})();
//Works with Litegl.js to create WebGL nodes
if(typeof(LiteGraph) != "undefined")
{
	function LGraphTexture()
	{
		this.addOutput("Texture","Texture");
		this.properties = { name:"", filter: true };
		this.size = [LGraphTexture.image_preview_size, LGraphTexture.image_preview_size];
	}

	LGraphTexture.title = "Texture";
	LGraphTexture.desc = "Texture";
	LGraphTexture.widgets_info = {"name": { widget:"texture"}, "filter": { widget:"checkbox"} };

	//REPLACE THIS TO INTEGRATE WITH YOUR FRAMEWORK
	LGraphTexture.loadTextureCallback = null; //function in charge of loading textures when not present in the container
	LGraphTexture.image_preview_size = 256;

	//flags to choose output texture type
	LGraphTexture.PASS_THROUGH = 1; //do not apply FX
	LGraphTexture.COPY = 2;			//create new texture with the same properties as the origin texture
	LGraphTexture.LOW = 3;			//create new texture with low precision (byte)
	LGraphTexture.HIGH = 4;			//create new texture with high precision (half-float)
	LGraphTexture.REUSE = 5;		//reuse input texture
	LGraphTexture.DEFAULT = 2;

	LGraphTexture.MODE_VALUES = {
		"pass through": LGraphTexture.PASS_THROUGH,
		"copy": LGraphTexture.COPY,
		"low": LGraphTexture.LOW,
		"high": LGraphTexture.HIGH,
		"reuse": LGraphTexture.REUSE,
		"default": LGraphTexture.DEFAULT
	};

	//returns the container where all the loaded textures are stored (overwrite if you have a Resources Manager)
	LGraphTexture.getTexturesContainer = function()
	{
		return gl.textures;
	}

	//process the loading of a texture (overwrite it if you have a Resources Manager)
	LGraphTexture.loadTexture = function(name, options)
	{
		options = options || {};
		var url = name;
		if(url.substr(0,7) == "http://")
		{
			if(LiteGraph.proxy) //proxy external files
				url = LiteGraph.proxy + url.substr(7);
		}

		var container = LGraphTexture.getTexturesContainer();
		var tex = container[ name ] = GL.Texture.fromURL(url, options);
		return tex;
	}

	LGraphTexture.getTexture = function(name)
	{
		var container = this.getTexturesContainer();

		if(!container)
			throw("Cannot load texture, container of textures not found");

		var tex = container[ name ];
		if(!tex && name && name[0] != ":")
			return this.loadTexture(name);

		return tex;
	}

	//used to compute the appropiate output texture
	LGraphTexture.getTargetTexture = function( origin, target, mode )
	{
		if(!origin)
			throw("LGraphTexture.getTargetTexture expects a reference texture");

		var tex_type = null;

		switch(mode)
		{
			case LGraphTexture.LOW: tex_type = gl.UNSIGNED_BYTE; break;
			case LGraphTexture.HIGH: tex_type = gl.HIGH_PRECISION_FORMAT; break;
			case LGraphTexture.REUSE: return origin; break;
			case LGraphTexture.COPY: 
			default: tex_type = origin ? origin.type : gl.UNSIGNED_BYTE; break;
		}

		if(!target || target.width != origin.width || target.height != origin.height || target.type != tex_type )
			target = new GL.Texture( origin.width, origin.height, { type: tex_type, format: gl.RGBA, filter: gl.LINEAR });

		return target;
	}

	LGraphTexture.getNoiseTexture = function()
	{
		if(this._noise_texture)
			return this._noise_texture;

		var noise = new Uint8Array(512*512*4);
		for(var i = 0; i < 512*512*4; ++i)
			noise[i] = Math.random() * 255;

		var texture = GL.Texture.fromMemory(512,512,noise,{ format: gl.RGBA, wrap: gl.REPEAT, filter: gl.NEAREST });
		this._noise_texture = texture;
		return texture;
	}

	LGraphTexture.prototype.onDropFile = function(data, filename, file)
	{
		if(!data)
		{
			this._drop_texture = null;
			this.properties.name = "";
		}
		else
		{
			var texture = null;
			if( typeof(data) == "string" )
				texture = GL.Texture.fromURL( data );
			else if( filename.toLowerCase().indexOf(".dds") != -1 )
				texture = GL.Texture.fromDDSInMemory(data);
			else
			{
				var blob = new Blob([file]);
				var url = URL.createObjectURL(blob);
				texture = GL.Texture.fromURL( url );
			}

			this._drop_texture = texture;
			this.properties.name = filename;
		}
	}

	LGraphTexture.prototype.getExtraMenuOptions = function(graphcanvas)
	{
		var that = this;
		if(!this._drop_texture)
			return;
		return [ {content:"Clear", callback: 
			function() { 
				that._drop_texture = null;
				that.properties.name = "";
			}
		}];
	}

	LGraphTexture.prototype.onExecute = function()
	{
		var tex = null;
		if(this.isOutputConnected(1))
			tex = this.getInputData(0);		

		if(!tex && this._drop_texture)
			tex = this._drop_texture;

		if(!tex && this.properties.name)
			tex = LGraphTexture.getTexture( this.properties.name );

		if(!tex) 
			return;

		this._last_tex = tex;

		if(this.properties.filter === false)
			tex.setParameter( gl.TEXTURE_MAG_FILTER, gl.NEAREST );
		else 
			tex.setParameter( gl.TEXTURE_MAG_FILTER, gl.LINEAR );

		this.setOutputData(0, tex);

		for(var i = 1; i < this.outputs.length; i++)
		{
			var output = this.outputs[i];
			if(!output)
				continue;
			var v = null;
			if(output.name == "width")
				v = tex.width;
			else if(output.name == "height")
				v = tex.height;
			else if(output.name == "aspect")
				v = tex.width / tex.height;
			this.setOutputData(i, v);
		}
	}

	LGraphTexture.prototype.onResourceRenamed = function(old_name,new_name)
	{
		if(this.properties.name == old_name)
			this.properties.name = new_name;
	}

	LGraphTexture.prototype.onDrawBackground = function(ctx)
	{
		if( this.flags.collapsed || this.size[1] <= 20 )
			return;

		if( this._drop_texture && ctx.webgl )
		{
			ctx.drawImage( this._drop_texture, 0,0,this.size[0],this.size[1]);
			//this._drop_texture.renderQuad(this.pos[0],this.pos[1],this.size[0],this.size[1]);
			return;
		}


		//Different texture? then get it from the GPU
		if(this._last_preview_tex != this._last_tex)
		{
			if(ctx.webgl)
			{
				this._canvas = this._last_tex;
			}
			else
			{
				var tex_canvas = LGraphTexture.generateLowResTexturePreview(this._last_tex);
				if(!tex_canvas) 
					return;

				this._last_preview_tex = this._last_tex;
				this._canvas = cloneCanvas(tex_canvas);
			}
		}

		if(!this._canvas)
			return;

		//render to graph canvas
		ctx.save();
		if(!ctx.webgl) //reverse image
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
		}
		ctx.drawImage(this._canvas,0,0,this.size[0],this.size[1]);
		ctx.restore();
	}


	//very slow, used at your own risk
	LGraphTexture.generateLowResTexturePreview = function(tex)
	{
		if(!tex)
			return null;

		var size = LGraphTexture.image_preview_size;
		var temp_tex = tex;

		if(tex.format == gl.DEPTH_COMPONENT)
			return null; //cannot generate from depth

		//Generate low-level version in the GPU to speed up
		if(tex.width > size || tex.height > size)
		{
			temp_tex = this._preview_temp_tex;
			if(!this._preview_temp_tex)
			{
				temp_tex = new GL.Texture(size,size, { minFilter: gl.NEAREST });
				this._preview_temp_tex = temp_tex;
			}

			//copy
			tex.copyTo(temp_tex);
			tex = temp_tex;
		}

		//create intermediate canvas with lowquality version
		var tex_canvas = this._preview_canvas;
		if(!tex_canvas)
		{
			tex_canvas = createCanvas(size,size);
			this._preview_canvas = tex_canvas;
		}

		if(temp_tex)
			temp_tex.toCanvas(tex_canvas);
		return tex_canvas;
	}

	LGraphTexture.prototype.getResources = function(res)
	{
		res[ this.properties.name ] = GL.Texture;
		return res;
	}

	LGraphTexture.prototype.onGetInputs = function()
	{
		return [["in","Texture"]];
	}


	LGraphTexture.prototype.onGetOutputs = function()
	{
		return [["width","number"],["height","number"],["aspect","number"]];
	}

	LiteGraph.registerNodeType("texture/texture", LGraphTexture );

	//**************************
	function LGraphTexturePreview()
	{
		this.addInput("Texture","Texture");
		this.properties = { flipY: false };
		this.size = [LGraphTexture.image_preview_size, LGraphTexture.image_preview_size];
	}

	LGraphTexturePreview.title = "Preview";
	LGraphTexturePreview.desc = "Show a texture in the graph canvas";

	LGraphTexturePreview.prototype.onDrawBackground = function(ctx)
	{
		if(this.flags.collapsed)
			return;

		if(!ctx.webgl)
			return; //not working well

		var tex = this.getInputData(0);
		if(!tex) return;

		var tex_canvas = null;
		
		if(!tex.handle && ctx.webgl)
			tex_canvas = tex;
		else
			tex_canvas = LGraphTexture.generateLowResTexturePreview(tex);

		//render to graph canvas
		ctx.save();
		if(this.properties.flipY)
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
		}
		ctx.drawImage(tex_canvas,0,0,this.size[0],this.size[1]);
		ctx.restore();
	}

	LiteGraph.registerNodeType("texture/preview", LGraphTexturePreview );

	//**************************************

	function LGraphTextureSave()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = {name:""};
	}

	LGraphTextureSave.title = "Save";
	LGraphTextureSave.desc = "Save a texture in the repository";

	LGraphTextureSave.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		if(this.properties.name)
		{
			var container = LGraphTexture.getTexturesContainer();
			container[ this.properties.name ] = tex;
		}

		this.setOutputData(0, tex);
	}

	LiteGraph.registerNodeType("texture/save", LGraphTextureSave );

	//****************************************************

	function LGraphTextureOperation()
	{
		this.addInput("Texture","Texture");
		this.addInput("TextureB","Texture");
		this.addInput("value","number");
		this.addOutput("Texture","Texture");
		this.help = "<p>pixelcode must be vec3</p>\
			<p>uvcode must be vec2, is optional</p>\
			<p><strong>uv:</strong> tex. coords</p><p><strong>color:</strong> texture</p><p><strong>colorB:</strong> textureB</p><p><strong>time:</strong> scene time</p><p><strong>value:</strong> input value</p>";

		this.properties = {value:1, uvcode:"", pixelcode:"color + colorB * value", precision: LGraphTexture.DEFAULT };
	}

	LGraphTextureOperation.widgets_info = {
		"uvcode": { widget:"textarea", height: 100 }, 
		"pixelcode": { widget:"textarea", height: 100 },
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureOperation.title = "Operation";
	LGraphTextureOperation.desc = "Texture shader operation";

	LGraphTextureOperation.prototype.getExtraMenuOptions = function(graphcanvas)
	{
		var that = this;
		var txt = !that.properties.show ? "Show Texture" : "Hide Texture";
		return [ {content: txt, callback: 
			function() { 
				that.properties.show = !that.properties.show;
			}
		}];
	}

	LGraphTextureOperation.prototype.onDrawBackground = function(ctx)
	{
		if(this.flags.collapsed || this.size[1] <= 20 || !this.properties.show)
			return;

		if(!this._tex)
			return;

		//only works if using a webgl renderer
		if(this._tex.gl != ctx)
			return;

		//render to graph canvas
		ctx.save();
		ctx.drawImage(this._tex, 0, 0, this.size[0], this.size[1]);
		ctx.restore();
	}

	LGraphTextureOperation.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);

		if(!this.isOutputConnected(0))
			return; //saves work

		if(this.properties.precision === LGraphTexture.PASS_THROUGH)
		{
			this.setOutputData(0, tex);
			return;
		}

		var texB = this.getInputData(1);

		if(!this.properties.uvcode && !this.properties.pixelcode)
			return;

		var width = 512;
		var height = 512;
		var type = gl.UNSIGNED_BYTE;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
			type = tex.type;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
			type = texB.type;
		}

		if(!tex && !this._tex )
			this._tex = new GL.Texture( width, height, { type: this.precision === LGraphTexture.LOW ? gl.UNSIGNED_BYTE : gl.HIGH_PRECISION_FORMAT, format: gl.RGBA, filter: gl.LINEAR });
		else
			this._tex = LGraphTexture.getTargetTexture( tex || this._tex, this._tex, this.properties.precision );

		/*
		if(this.properties.low_precision)
			type = gl.UNSIGNED_BYTE;

		if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
			this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });
		*/

		var uvcode = "";
		if(this.properties.uvcode)
		{
			uvcode = "uv = " + this.properties.uvcode;
			if(this.properties.uvcode.indexOf(";") != -1) //there are line breaks, means multiline code
				uvcode = this.properties.uvcode;
		}
		
		var pixelcode = "";
		if(this.properties.pixelcode)
		{
			pixelcode = "result = " + this.properties.pixelcode;
			if(this.properties.pixelcode.indexOf(";") != -1) //there are line breaks, means multiline code
				pixelcode = this.properties.pixelcode;
		}

		var shader = this._shader;

		if(!shader || this._shader_code != (uvcode + "|" + pixelcode) )
		{
			try
			{
				this._shader = new GL.Shader(Shader.SCREEN_VERTEX_SHADER, LGraphTextureOperation.pixel_shader, { UV_CODE: uvcode, PIXEL_CODE: pixelcode });
				this.boxcolor = "#00FF00";
			}
			catch (err)
			{
				console.log("Error compiling shader: ", err);
				this.boxcolor = "#FF0000";
				return;
			}
			this.boxcolor = "#FF0000";

			this._shader_code = (uvcode + "|" + pixelcode);
			shader = this._shader;
		}

		if(!shader)
		{
			this.boxcolor = "red";
			return;
		}
		else
			this.boxcolor = "green";

		var value = this.getInputData(2);
		if(value != null)
			this.properties.value = value;
		else
			value = parseFloat( this.properties.value );

		var time = this.graph.getTime();

		this._tex.drawTo(function() {
			gl.disable( gl.DEPTH_TEST );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			if(tex)	tex.bind(0);
			if(texB) texB.bind(1);
			var mesh = Mesh.getScreenQuad();
			shader.uniforms({u_texture:0, u_textureB:1, value: value, texSize:[width,height], time: time}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureOperation.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_textureB;\n\
			varying vec2 v_coord;\n\
			uniform vec2 texSize;\n\
			uniform float time;\n\
			uniform float value;\n\
			\n\
			void main() {\n\
				vec2 uv = v_coord;\n\
				UV_CODE;\n\
				vec4 color4 = texture2D(u_texture, uv);\n\
				vec3 color = color4.rgb;\n\
				vec4 color4B = texture2D(u_textureB, uv);\n\
				vec3 colorB = color4B.rgb;\n\
				vec3 result = color;\n\
				float alpha = 1.0;\n\
				PIXEL_CODE;\n\
				gl_FragColor = vec4(result, alpha);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/operation", LGraphTextureOperation );

	//****************************************************

	function LGraphTextureShader()
	{
		this.addOutput("Texture","Texture");
		this.properties = {code:"", width: 512, height: 512};

		this.properties.code = "\nvoid main() {\n  vec2 uv = coord;\n  vec3 color = vec3(0.0);\n//your code here\n\ngl_FragColor = vec4(color, 1.0);\n}\n";
	}

	LGraphTextureShader.title = "Shader";
	LGraphTextureShader.desc = "Texture shader";
	LGraphTextureShader.widgets_info = {
		"code": { type:"code" },
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureShader.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		//replug 
		if(this._shader_code != this.properties.code)
		{
			this._shader_code = this.properties.code;
			this._shader = new GL.Shader(Shader.SCREEN_VERTEX_SHADER, LGraphTextureShader.pixel_shader + this.properties.code );
			if(!this._shader) {
				this.boxcolor = "red";
				return;
			}
			else
				this.boxcolor = "green";
			/*
			var uniforms = this._shader.uniformLocations;
			//disconnect inputs
			if(this.inputs)
				for(var i = 0; i < this.inputs.length; i++)
				{
					var slot = this.inputs[i];
					if(slot.link != null)
						this.disconnectInput(i);
				}

			for(var i = 0; i < uniforms.length; i++)
			{
				var type = "number";
				if( this._shader.isSampler[i] )
					type = "texture";
				else
				{
					var v = gl.getUniform(this._shader.program, i);
					type = typeof(v);
					if(type == "object" && v.length)
					{
						switch(v.length)
						{
							case 1: type = "number"; break;
							case 2: type = "vec2"; break;
							case 3: type = "vec3"; break;
							case 4: type = "vec4"; break;
							case 9: type = "mat3"; break;
							case 16: type = "mat4"; break;
							default: continue;
						}
					}
				}
				this.addInput(i,type);
			}
			*/
		}

		if(!this._tex || this._tex.width != this.properties.width || this._tex.height != this.properties.height )
			this._tex = new GL.Texture( this.properties.width, this.properties.height, { format: gl.RGBA, filter: gl.LINEAR });
		var tex = this._tex;
		var shader = this._shader;
		var time = this.graph.getTime();
		tex.drawTo(function()	{
			shader.uniforms({texSize: [tex.width, tex.height], time: time}).draw( Mesh.getScreenQuad() );
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureShader.pixel_shader = "precision highp float;\n\
			\n\
			varying vec2 v_coord;\n\
			uniform float time;\n\
			";

	LiteGraph.registerNodeType("texture/shader", LGraphTextureShader );

	// Texture Scale Offset

	function LGraphTextureScaleOffset()
	{
		this.addInput("in","Texture");
		this.addInput("scale","vec2");
		this.addInput("offset","vec2");
		this.addOutput("out","Texture");
		this.properties = { offset: vec2.fromValues(0,0), scale: vec2.fromValues(1,1), precision: LGraphTexture.DEFAULT };
	}

	LGraphTextureScaleOffset.widgets_info = {
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureScaleOffset.title = "Scale/Offset";
	LGraphTextureScaleOffset.desc = "Applies an scaling and offseting";

	LGraphTextureScaleOffset.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);

		if(!this.isOutputConnected(0) || !tex)
			return; //saves work

		if(this.properties.precision === LGraphTexture.PASS_THROUGH)
		{
			this.setOutputData(0, tex);
			return;
		}

		var width = tex.width;
		var height = tex.height;
		var type = this.precision === LGraphTexture.LOW ? gl.UNSIGNED_BYTE : gl.HIGH_PRECISION_FORMAT;
		if (this.precision === LGraphTexture.DEFAULT)
			type = tex.type;

		if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
			this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

		var shader = this._shader;

		if(!shader)
			shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphTextureScaleOffset.pixel_shader );

		var scale = this.getInputData(1);
		if(scale)
		{
			this.properties.scale[0] = scale[0];
			this.properties.scale[1] = scale[1];
		}
		else
			scale = this.properties.scale;

		var offset = this.getInputData(2);
		if(offset)
		{
			this.properties.offset[0] = offset[0];
			this.properties.offset[1] = offset[1];
		}
		else
			offset = this.properties.offset;

		this._tex.drawTo(function() {
			gl.disable( gl.DEPTH_TEST );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			tex.bind(0);
			var mesh = Mesh.getScreenQuad();
			shader.uniforms({u_texture:0, u_scale: scale, u_offset: offset}).draw( mesh );
		});

		this.setOutputData( 0, this._tex );
	}

	LGraphTextureScaleOffset.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_textureB;\n\
			varying vec2 v_coord;\n\
			uniform vec2 u_scale;\n\
			uniform vec2 u_offset;\n\
			\n\
			void main() {\n\
				vec2 uv = v_coord;\n\
				uv = uv / u_scale - u_offset;\n\
				gl_FragColor = texture2D(u_texture, uv);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/scaleOffset", LGraphTextureScaleOffset );



	// Warp (distort a texture) *************************

	function LGraphTextureWarp()
	{
		this.addInput("in","Texture");
		this.addInput("warp","Texture");
		this.addInput("factor","number");
		this.addOutput("out","Texture");
		this.properties = { factor: 0.01, precision: LGraphTexture.DEFAULT };
	}

	LGraphTextureWarp.widgets_info = {
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureWarp.title = "Warp";
	LGraphTextureWarp.desc = "Texture warp operation";

	LGraphTextureWarp.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);

		if(!this.isOutputConnected(0))
			return; //saves work

		if(this.properties.precision === LGraphTexture.PASS_THROUGH)
		{
			this.setOutputData(0, tex);
			return;
		}

		var texB = this.getInputData(1);

		var width = 512;
		var height = 512;
		var type = gl.UNSIGNED_BYTE;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
			type = tex.type;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
			type = texB.type;
		}

		if(!tex && !this._tex )
			this._tex = new GL.Texture( width, height, { type: this.precision === LGraphTexture.LOW ? gl.UNSIGNED_BYTE : gl.HIGH_PRECISION_FORMAT, format: gl.RGBA, filter: gl.LINEAR });
		else
			this._tex = LGraphTexture.getTargetTexture( tex || this._tex, this._tex, this.properties.precision );

		var shader = this._shader;

		if(!shader)
			shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphTextureWarp.pixel_shader );

		var factor = this.getInputData(2);
		if(factor != null)
			this.properties.factor = factor;
		else
			factor = parseFloat( this.properties.factor );

		this._tex.drawTo(function() {
			gl.disable( gl.DEPTH_TEST );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			if(tex)	tex.bind(0);
			if(texB) texB.bind(1);
			var mesh = Mesh.getScreenQuad();
			shader.uniforms({u_texture:0, u_textureB:1, u_factor: factor }).draw( mesh );
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureWarp.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_textureB;\n\
			varying vec2 v_coord;\n\
			uniform float u_factor;\n\
			\n\
			void main() {\n\
				vec2 uv = v_coord;\n\
				uv += texture2D(u_textureB, uv).rg * u_factor;\n\
				gl_FragColor = texture2D(u_texture, uv);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/warp", LGraphTextureWarp );

	//****************************************************

	// Texture to Viewport *****************************************
	function LGraphTextureToViewport()
	{
		this.addInput("Texture","Texture");
		this.properties = { additive: false, antialiasing: false, filter: true, disable_alpha: false, gamma: 1.0 };
		this.size[0] = 130;
	}

	LGraphTextureToViewport.title = "to Viewport";
	LGraphTextureToViewport.desc = "Texture to viewport";

	LGraphTextureToViewport.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) 
			return;

		if(this.properties.disable_alpha)
			gl.disable( gl.BLEND );
		else
		{
			gl.enable( gl.BLEND );
			if(this.properties.additive)
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
			else
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		}

		gl.disable( gl.DEPTH_TEST );
		var gamma = this.properties.gamma || 1.0;
		if( this.isInputConnected(1) )
			gamma = this.getInputData(1);

		tex.setParameter( gl.TEXTURE_MAG_FILTER, this.properties.filter ? gl.LINEAR : gl.NEAREST );

		if(this.properties.antialiasing)
		{
			if(!LGraphTextureToViewport._shader)
				LGraphTextureToViewport._shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphTextureToViewport.aa_pixel_shader );

			var viewport = gl.getViewport(); //gl.getParameter(gl.VIEWPORT);
			var mesh = Mesh.getScreenQuad();
			tex.bind(0);
			LGraphTextureToViewport._shader.uniforms({u_texture:0, uViewportSize:[tex.width,tex.height], u_igamma: 1 / gamma,  inverseVP: [1/tex.width,1/tex.height] }).draw(mesh);
		}
		else
		{
			if(gamma != 1.0)
			{
				if(!LGraphTextureToViewport._gamma_shader)
					LGraphTextureToViewport._gamma_shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureToViewport.gamma_pixel_shader );
				tex.toViewport(LGraphTextureToViewport._gamma_shader, { u_texture:0, u_igamma: 1 / gamma });
			}
			else
				tex.toViewport();
		}
	}

	LGraphTextureToViewport.prototype.onGetInputs = function()
	{
		return [["gamma","number"]];
	}

	LGraphTextureToViewport.aa_pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 uViewportSize;\n\
			uniform vec2 inverseVP;\n\
			uniform float u_igamma;\n\
			#define FXAA_REDUCE_MIN   (1.0/ 128.0)\n\
			#define FXAA_REDUCE_MUL   (1.0 / 8.0)\n\
			#define FXAA_SPAN_MAX     8.0\n\
			\n\
			/* from mitsuhiko/webgl-meincraft based on the code on geeks3d.com */\n\
			vec4 applyFXAA(sampler2D tex, vec2 fragCoord)\n\
			{\n\
				vec4 color = vec4(0.0);\n\
				/*vec2 inverseVP = vec2(1.0 / uViewportSize.x, 1.0 / uViewportSize.y);*/\n\
				vec3 rgbNW = texture2D(tex, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbNE = texture2D(tex, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbSW = texture2D(tex, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbSE = texture2D(tex, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbM  = texture2D(tex, fragCoord  * inverseVP).xyz;\n\
				vec3 luma = vec3(0.299, 0.587, 0.114);\n\
				float lumaNW = dot(rgbNW, luma);\n\
				float lumaNE = dot(rgbNE, luma);\n\
				float lumaSW = dot(rgbSW, luma);\n\
				float lumaSE = dot(rgbSE, luma);\n\
				float lumaM  = dot(rgbM,  luma);\n\
				float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n\
				float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n\
				\n\
				vec2 dir;\n\
				dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n\
				dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n\
				\n\
				float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n\
				\n\
				float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n\
				dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;\n\
				\n\
				vec3 rgbA = 0.5 * (texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);\n\
				vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);\n\
				\n\
				//return vec4(rgbA,1.0);\n\
				float lumaB = dot(rgbB, luma);\n\
				if ((lumaB < lumaMin) || (lumaB > lumaMax))\n\
					color = vec4(rgbA, 1.0);\n\
				else\n\
					color = vec4(rgbB, 1.0);\n\
				if(u_igamma != 1.0)\n\
					color.xyz = pow( color.xyz, vec3(u_igamma) );\n\
				return color;\n\
			}\n\
			\n\
			void main() {\n\
			   gl_FragColor = applyFXAA( u_texture, v_coord * uViewportSize) ;\n\
			}\n\
			";

	LGraphTextureToViewport.gamma_pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform float u_igamma;\n\
			void main() {\n\
				vec4 color = texture2D( u_texture, v_coord);\n\
				color.xyz = pow(color.xyz, vec3(u_igamma) );\n\
			   gl_FragColor = color;\n\
			}\n\
			";


	LiteGraph.registerNodeType("texture/toviewport", LGraphTextureToViewport );


	// Texture Copy *****************************************
	function LGraphTextureCopy()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = { size: 0, generate_mipmaps: false, precision: LGraphTexture.DEFAULT };
	}

	LGraphTextureCopy.title = "Copy";
	LGraphTextureCopy.desc = "Copy Texture";
	LGraphTextureCopy.widgets_info = { 
		size: { widget:"combo", values:[0,32,64,128,256,512,1024,2048]},
		precision: { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureCopy.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex && !this._temp_texture)
			return;

		if(!this.isOutputConnected(0))
			return; //saves work

		//copy the texture
		if(tex)
		{
			var width = tex.width;
			var height = tex.height;

			if(this.properties.size != 0)
			{
				width = this.properties.size;
				height = this.properties.size;
			}

			var temp = this._temp_texture;

			var type = tex.type;
			if(this.properties.precision === LGraphTexture.LOW)
				type = gl.UNSIGNED_BYTE;
			else if(this.properties.precision === LGraphTexture.HIGH)
				type = gl.HIGH_PRECISION_FORMAT;

			if(!temp || temp.width != width || temp.height != height || temp.type != type )
			{
				var minFilter = gl.LINEAR;
				if( this.properties.generate_mipmaps && isPowerOfTwo(width) && isPowerOfTwo(height) )
					minFilter = gl.LINEAR_MIPMAP_LINEAR;
				this._temp_texture = new GL.Texture( width, height, { type: type, format: gl.RGBA, minFilter: minFilter, magFilter: gl.LINEAR });
			}
			tex.copyTo(this._temp_texture);

			if(this.properties.generate_mipmaps)
			{
				this._temp_texture.bind(0);
				gl.generateMipmap(this._temp_texture.texture_type);
				this._temp_texture.unbind(0);
			}
		}


		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/copy", LGraphTextureCopy );


	// Texture Copy *****************************************
	function LGraphTextureAverage()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = { low_precision: false };
	}

	LGraphTextureAverage.title = "Average";
	LGraphTextureAverage.desc = "Compute the total average of a texture and stores it as a 1x1 pixel texture";

	LGraphTextureAverage.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex)
			return;

		if(!this.isOutputConnected(0))
			return; //saves work

		if(!LGraphTextureAverage._shader)
		{
			LGraphTextureAverage._shader = new GL.Shader(Shader.SCREEN_VERTEX_SHADER, LGraphTextureAverage.pixel_shader);
			var samples = new Float32Array(32);
			for(var i = 0; i < 32; ++i)	
				samples[i] = Math.random();
			LGraphTextureAverage._shader.uniforms({u_samples_a: samples.subarray(0,16), u_samples_b: samples.subarray(16,32) });
		}

		var temp = this._temp_texture;
		var type = this.properties.low_precision ? gl.UNSIGNED_BYTE : tex.type;
		if(!temp || temp.type != type )
			this._temp_texture = new GL.Texture( 1, 1, { type: type, format: gl.RGBA, filter: gl.NEAREST });

		var shader = LGraphTextureAverage._shader;
		this._temp_texture.drawTo(function(){
			tex.toViewport(shader,{u_texture:0});
		});

		this.setOutputData(0,this._temp_texture);
	}

	LGraphTextureAverage.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			uniform mat4 u_samples_a;\n\
			uniform mat4 u_samples_b;\n\
			uniform sampler2D u_texture;\n\
			varying vec2 v_coord;\n\
			\n\
			void main() {\n\
				vec4 color = vec4(0.0);\n\
				for(int i = 0; i < 4; ++i)\n\
					for(int j = 0; j < 4; ++j)\n\
					{\n\
						color += texture2D(u_texture, vec2( u_samples_a[i][j], u_samples_b[i][j] ) );\n\
						color += texture2D(u_texture, vec2( 1.0 - u_samples_a[i][j], u_samples_b[i][j] ) );\n\
					}\n\
			   gl_FragColor = color * 0.03125;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/average", LGraphTextureAverage );

	// Image To Texture *****************************************
	function LGraphImageToTexture()
	{
		this.addInput("Image","image");
		this.addOutput("","Texture");
		this.properties = {};
	}

	LGraphImageToTexture.title = "Image to Texture";
	LGraphImageToTexture.desc = "Uploads an image to the GPU";
	//LGraphImageToTexture.widgets_info = { size: { widget:"combo", values:[0,32,64,128,256,512,1024,2048]} };

	LGraphImageToTexture.prototype.onExecute = function()
	{
		var img = this.getInputData(0);
		if(!img)
			return;

		var width = img.videoWidth || img.width;
		var height = img.videoHeight || img.height;

		//this is in case we are using a webgl canvas already, no need to reupload it
		if(img.gltexture)
		{
			this.setOutputData(0,img.gltexture);
			return;
		}


		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height )
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		try
		{
			this._temp_texture.uploadImage(img);
		}
		catch(err)
		{
			console.error("image comes from an unsafe location, cannot be uploaded to webgl");
			return;
		}

		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/imageToTexture", LGraphImageToTexture );


	// Texture LUT *****************************************
	function LGraphTextureLUT()
	{
		this.addInput("Texture","Texture");
		this.addInput("LUT","Texture");
		this.addInput("Intensity","number");
		this.addOutput("","Texture");
		this.properties = { intensity: 1, precision: LGraphTexture.DEFAULT, texture: null };

		if(!LGraphTextureLUT._shader)
			LGraphTextureLUT._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureLUT.pixel_shader );
	}

	LGraphTextureLUT.widgets_info = { 
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureLUT.title = "LUT";
	LGraphTextureLUT.desc = "Apply LUT to Texture";
	LGraphTextureLUT.widgets_info = {"texture": { widget:"texture"} };

	LGraphTextureLUT.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		var tex = this.getInputData(0);

		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}

		if(!tex) return;

		var lut_tex = this.getInputData(1);

		if(!lut_tex)
			lut_tex = LGraphTexture.getTexture( this.properties.texture );

		if(!lut_tex)
		{
			this.setOutputData(0,tex);
			return;
		}

		lut_tex.bind(0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		gl.bindTexture(gl.TEXTURE_2D, null);

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
			this.properties.intensity = intensity = this.getInputData(2);

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		//var mesh = Mesh.getScreenQuad();

		this._tex.drawTo(function() {
			lut_tex.bind(1);
			tex.toViewport( LGraphTextureLUT._shader, {u_texture:0, u_textureB:1, u_amount: intensity} );
		});

		this.setOutputData(0,this._tex);
	}

	LGraphTextureLUT.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_textureB;\n\
			uniform float u_amount;\n\
			\n\
			void main() {\n\
				 lowp vec4 textureColor = clamp( texture2D(u_texture, v_coord), vec4(0.0), vec4(1.0) );\n\
				 mediump float blueColor = textureColor.b * 63.0;\n\
				 mediump vec2 quad1;\n\
				 quad1.y = floor(floor(blueColor) / 8.0);\n\
				 quad1.x = floor(blueColor) - (quad1.y * 8.0);\n\
				 mediump vec2 quad2;\n\
				 quad2.y = floor(ceil(blueColor) / 8.0);\n\
				 quad2.x = ceil(blueColor) - (quad2.y * 8.0);\n\
				 highp vec2 texPos1;\n\
				 texPos1.x = (quad1.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
				 texPos1.y = 1.0 - ((quad1.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
				 highp vec2 texPos2;\n\
				 texPos2.x = (quad2.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
				 texPos2.y = 1.0 - ((quad2.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
				 lowp vec4 newColor1 = texture2D(u_textureB, texPos1);\n\
				 lowp vec4 newColor2 = texture2D(u_textureB, texPos2);\n\
				 lowp vec4 newColor = mix(newColor1, newColor2, fract(blueColor));\n\
				 gl_FragColor = vec4( mix( textureColor.rgb, newColor.rgb, u_amount), textureColor.w);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/LUT", LGraphTextureLUT );

	// Texture Channels *****************************************
	function LGraphTextureChannels()
	{
		this.addInput("Texture","Texture");

		this.addOutput("R","Texture");
		this.addOutput("G","Texture");
		this.addOutput("B","Texture");
		this.addOutput("A","Texture");

		this.properties = {};
		if(!LGraphTextureChannels._shader)
			LGraphTextureChannels._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureChannels.pixel_shader );
	}

	LGraphTextureChannels.title = "Texture to Channels";
	LGraphTextureChannels.desc = "Split texture channels";

	LGraphTextureChannels.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);
		if(!texA) return;

		if(!this._channels)
			this._channels = Array(4);

		var connections = 0;
		for(var i = 0; i < 4; i++)
		{
			if(this.isOutputConnected(i))
			{
				if(!this._channels[i] || this._channels[i].width != texA.width || this._channels[i].height != texA.height || this._channels[i].type != texA.type)
					this._channels[i] = new GL.Texture( texA.width, texA.height, { type: texA.type, format: gl.RGBA, filter: gl.LINEAR });
				connections++;
			}
			else
				this._channels[i] = null;
		}

		if(!connections)
			return;

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureChannels._shader;
		var masks = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];

		for(var i = 0; i < 4; i++)
		{
			if(!this._channels[i])
				continue;

			this._channels[i].drawTo( function() {
				texA.bind(0);
				shader.uniforms({u_texture:0, u_mask: masks[i]}).draw(mesh);
			});
			this.setOutputData(i, this._channels[i]);
		}
	}

	LGraphTextureChannels.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec4 u_mask;\n\
			\n\
			void main() {\n\
			   gl_FragColor = vec4( vec3( length( texture2D(u_texture, v_coord) * u_mask )), 1.0 );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/textureChannels", LGraphTextureChannels );


	// Texture Channels to Texture *****************************************
	function LGraphChannelsTexture()
	{
		this.addInput("R","Texture");
		this.addInput("G","Texture");
		this.addInput("B","Texture");
		this.addInput("A","Texture");

		this.addOutput("Texture","Texture");

		this.properties = {};
		if(!LGraphChannelsTexture._shader)
			LGraphChannelsTexture._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphChannelsTexture.pixel_shader );
	}

	LGraphChannelsTexture.title = "Channels to Texture";
	LGraphChannelsTexture.desc = "Split texture channels";

	LGraphChannelsTexture.prototype.onExecute = function()
	{
		var tex = [ this.getInputData(0),
				this.getInputData(1),
				this.getInputData(2),
				this.getInputData(3) ];

		if(!tex[0] || !tex[1] || !tex[2] || !tex[3]) 
			return;

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphChannelsTexture._shader;

		this._tex = LGraphTexture.getTargetTexture( tex[0], this._tex );

		this._tex.drawTo( function() {
			tex[0].bind(0);
			tex[1].bind(1);
			tex[2].bind(2);
			tex[3].bind(3);
			shader.uniforms({u_textureR:0, u_textureG:1, u_textureB:2, u_textureA:3 }).draw(mesh);
		});
		this.setOutputData(0, this._tex);
	}

	LGraphChannelsTexture.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_textureR;\n\
			uniform sampler2D u_textureG;\n\
			uniform sampler2D u_textureB;\n\
			uniform sampler2D u_textureA;\n\
			\n\
			void main() {\n\
			   gl_FragColor = vec4( \
						texture2D(u_textureR, v_coord).r,\
						texture2D(u_textureG, v_coord).r,\
						texture2D(u_textureB, v_coord).r,\
						texture2D(u_textureA, v_coord).r);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/channelsTexture", LGraphChannelsTexture );

	// Texture Channels to Texture *****************************************
	function LGraphTextureGradient()
	{
		this.addInput("A","color");
		this.addInput("B","color");
		this.addOutput("Texture","Texture");

		this.properties = { angle: 0, scale: 1, A:[0,0,0], B:[1,1,1], texture_size:32 };
		if(!LGraphTextureGradient._shader)
			LGraphTextureGradient._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureGradient.pixel_shader );

		this._uniforms = { u_angle: 0, u_colorA: vec3.create(), u_colorB: vec3.create()};
	}

	LGraphTextureGradient.title = "Gradient";
	LGraphTextureGradient.desc = "Generates a gradient";
	LGraphTextureGradient["@A"] = { type:"color" };
	LGraphTextureGradient["@B"] = { type:"color" };
	LGraphTextureGradient["@texture_size"] = { type:"enum", values:[32,64,128,256,512] };

	LGraphTextureGradient.prototype.onExecute = function()
	{
		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = GL.Mesh.getScreenQuad();
		var shader = LGraphTextureGradient._shader;

		var A = this.getInputData(0);
		if(!A)
			A = this.properties.A;
		var B = this.getInputData(1);
		if(!B)
			B = this.properties.B;

		//angle and scale
		for(var i = 2; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			this.properties[ input.name ] = v;
		}

		var uniforms = this._uniforms;
		this._uniforms.u_angle = this.properties.angle * DEG2RAD;
		this._uniforms.u_scale = this.properties.scale;
		vec3.copy( uniforms.u_colorA, A );
		vec3.copy( uniforms.u_colorB, B );

		var size = parseInt( this.properties.texture_size );
		if(!this._tex || this._tex.width != size )
			this._tex = new GL.Texture( size, size, { format: gl.RGB, filter: gl.LINEAR });

		this._tex.drawTo( function() {
			shader.uniforms(uniforms).draw(mesh);
		});
		this.setOutputData(0, this._tex);
	}

	LGraphTextureGradient.prototype.onGetInputs = function()
	{
		return [["angle","number"],["scale","number"]];
	}

	LGraphTextureGradient.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform float u_angle;\n\
			uniform float u_scale;\n\
			uniform vec3 u_colorA;\n\
			uniform vec3 u_colorB;\n\
			\n\
			vec2 rotate(vec2 v, float angle)\n\
			{\n\
				vec2 result;\n\
				float _cos = cos(angle);\n\
				float _sin = sin(angle);\n\
				result.x = v.x * _cos - v.y * _sin;\n\
				result.y = v.x * _sin + v.y * _cos;\n\
				return result;\n\
			}\n\
			void main() {\n\
				float f = (rotate(u_scale * (v_coord - vec2(0.5)), u_angle) + vec2(0.5)).x;\n\
				vec3 color = mix(u_colorA,u_colorB,clamp(f,0.0,1.0));\n\
			   gl_FragColor = vec4(color,1.0);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/gradient", LGraphTextureGradient );

	// Texture Mix *****************************************
	function LGraphTextureMix()
	{
		this.addInput("A","Texture");
		this.addInput("B","Texture");
		this.addInput("Mixer","Texture");

		this.addOutput("Texture","Texture");
		this.properties = { precision: LGraphTexture.DEFAULT };

		if(!LGraphTextureMix._shader)
			LGraphTextureMix._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureMix.pixel_shader );
	}

	LGraphTextureMix.title = "Mix";
	LGraphTextureMix.desc = "Generates a texture mixing two textures";

	LGraphTextureMix.widgets_info = { 
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureMix.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);

		if(!this.isOutputConnected(0))
			return; //saves work
		
		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,texA);
			return;
		}

		var texB = this.getInputData(1);
		var texMix = this.getInputData(2);
		if(!texA || !texB || !texMix) return;

		this._tex = LGraphTexture.getTargetTexture( texA, this._tex, this.properties.precision );

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureMix._shader;

		this._tex.drawTo( function() {
			texA.bind(0);
			texB.bind(1);
			texMix.bind(2);
			shader.uniforms({u_textureA:0,u_textureB:1,u_textureMix:2}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureMix.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_textureA;\n\
			uniform sampler2D u_textureB;\n\
			uniform sampler2D u_textureMix;\n\
			\n\
			void main() {\n\
			   gl_FragColor = mix( texture2D(u_textureA, v_coord), texture2D(u_textureB, v_coord), texture2D(u_textureMix, v_coord) );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/mix", LGraphTextureMix );

	// Texture Edges detection *****************************************
	function LGraphTextureEdges()
	{
		this.addInput("Tex.","Texture");

		this.addOutput("Edges","Texture");
		this.properties = { invert: true, factor: 1, precision: LGraphTexture.DEFAULT };

		if(!LGraphTextureEdges._shader)
			LGraphTextureEdges._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureEdges.pixel_shader );
	}

	LGraphTextureEdges.title = "Edges";
	LGraphTextureEdges.desc = "Detects edges";

	LGraphTextureEdges.widgets_info = { 
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureEdges.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		var tex = this.getInputData(0);

		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}		

		if(!tex) return;

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureEdges._shader;
		var invert = this.properties.invert;
		var factor = this.properties.factor;

		this._tex.drawTo( function() {
			tex.bind(0);
			shader.uniforms({u_texture:0, u_isize:[1/tex.width,1/tex.height], u_factor: factor, u_invert: invert ? 1 : 0}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureEdges.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_isize;\n\
			uniform int u_invert;\n\
			uniform float u_factor;\n\
			\n\
			void main() {\n\
				vec4 center = texture2D(u_texture, v_coord);\n\
				vec4 up = texture2D(u_texture, v_coord + u_isize * vec2(0.0,1.0) );\n\
				vec4 down = texture2D(u_texture, v_coord + u_isize * vec2(0.0,-1.0) );\n\
				vec4 left = texture2D(u_texture, v_coord + u_isize * vec2(1.0,0.0) );\n\
				vec4 right = texture2D(u_texture, v_coord + u_isize * vec2(-1.0,0.0) );\n\
				vec4 diff = abs(center - up) + abs(center - down) + abs(center - left) + abs(center - right);\n\
				diff *= u_factor;\n\
				if(u_invert == 1)\n\
					diff.xyz = vec3(1.0) - diff.xyz;\n\
			   gl_FragColor = vec4( diff.xyz, center.a );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/edges", LGraphTextureEdges );

	// Texture Depth *****************************************
	function LGraphTextureDepthRange()
	{
		this.addInput("Texture","Texture");
		this.addInput("Distance","number");
		this.addInput("Range","number");
		this.addOutput("Texture","Texture");
		this.properties = { distance:100, range: 50, high_precision: false };

		if(!LGraphTextureDepthRange._shader)
			LGraphTextureDepthRange._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureDepthRange.pixel_shader );
	}

	LGraphTextureDepthRange.title = "Depth Range";
	LGraphTextureDepthRange.desc = "Generates a texture with a depth range";

	LGraphTextureDepthRange.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		var tex = this.getInputData(0);
		if(!tex) return;

		var precision = gl.UNSIGNED_BYTE;
		if(this.properties.high_precision)
			precision = gl.half_float_ext ? gl.HALF_FLOAT_OES : gl.FLOAT;			

		if(!this._temp_texture || this._temp_texture.type != precision ||
			this._temp_texture.width != tex.width || this._temp_texture.height != tex.height)
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: precision, format: gl.RGBA, filter: gl.LINEAR });

		//iterations
		var distance = this.properties.distance;
		if( this.isInputConnected(1) )
		{
			distance = this.getInputData(1);
			this.properties.distance = distance;
		}

		var range = this.properties.range;
		if( this.isInputConnected(2) )
		{
			range = this.getInputData(2);
			this.properties.range = range;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureDepthRange._shader;

		//TODO: this asumes we have LiteScene, change it
		var camera = LS.Renderer._current_camera;
		var planes = [LS.Renderer._current_camera.near, LS.Renderer._current_camera.far];

		this._temp_texture.drawTo( function() {
			tex.bind(0);
			shader.uniforms({u_texture:0, u_distance: distance, u_range: range, u_camera_planes: planes })
				.draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureDepthRange.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform float u_distance;\n\
			uniform float u_range;\n\
			\n\
			float LinearDepth()\n\
			{\n\
				float n = u_camera_planes.x;\n\
				float f = u_camera_planes.y;\n\
				return (2.0 * n) / (f + n - texture2D(u_texture, v_coord).x * (f - n));\n\
			}\n\
			\n\
			void main() {\n\
				float diff = abs(LinearDepth() * u_camera_planes.y - u_distance);\n\
				float dof = 1.0;\n\
				if(diff <= u_range)\n\
					dof = diff / u_range;\n\
			   gl_FragColor = vec4(dof);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/depth_range", LGraphTextureDepthRange );

	// Texture Blur *****************************************
	function LGraphTextureBlur()
	{
		this.addInput("Texture","Texture");
		this.addInput("Iterations","number");
		this.addInput("Intensity","number");
		this.addOutput("Blurred","Texture");
		this.properties = { intensity: 1, iterations: 1, preserve_aspect: false, scale:[1,1] };

		if(!LGraphTextureBlur._shader)
			LGraphTextureBlur._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphTextureBlur.pixel_shader );
	}

	LGraphTextureBlur.title = "Blur";
	LGraphTextureBlur.desc = "Blur a texture";

	LGraphTextureBlur.max_iterations = 20;

	LGraphTextureBlur.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex)
			return;

		if(!this.isOutputConnected(0))
			return; //saves work

		var temp = this._temp_texture;

		if(!temp || temp.width != tex.width || temp.height != tex.height || temp.type != tex.type )
		{
			//we need two textures to do the blurring
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
			this._final_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
		}

		//iterations
		var iterations = this.properties.iterations;
		if( this.isInputConnected(1) )
		{
			iterations = this.getInputData(1);
			this.properties.iterations = iterations;
		}
		iterations = Math.min( Math.floor(iterations), LGraphTextureBlur.max_iterations );
		if(iterations == 0) //skip blurring
		{
			this.setOutputData(0, tex);
			return;
		}

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
		{
			intensity = this.getInputData(2);
			this.properties.intensity = intensity;
		}

		//blur sometimes needs an aspect correction
		var aspect = LiteGraph.camera_aspect;
		if(!aspect && window.gl !== undefined)
			aspect = gl.canvas.height / gl.canvas.width;
		if(!aspect)
			aspect = 1;
		aspect = this.properties.preserve_aspect ? aspect : 1;

		var start_texture = tex;
		var scale = this.properties.scale || [1,1];
		var origin = start_texture;
		for(var i = 0; i < iterations; ++i)
		{
			origin.applyBlur( aspect * scale[0] * i, scale[1] * i, intensity, this._temp_texture, this._final_texture );
			origin = this._final_texture;
		}

		this.setOutputData(0, this._final_texture);
	}

	LGraphTextureBlur.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_offset;\n\
			uniform float u_intensity;\n\
			void main() {\n\
			   vec4 sum = vec4(0.0);\n\
			   vec4 center = texture2D(u_texture, v_coord);\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -1.0) * 0.15/0.98;\n\
			   sum += center * 0.16/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 1.0) * 0.15/0.98;\n\
			   gl_FragColor = u_intensity * sum;\n\
			   /*gl_FragColor.a = center.a*/;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/blur", LGraphTextureBlur );

	// Texture Webcam *****************************************
	function LGraphTextureWebcam()
	{
		this.addOutput("Webcam","Texture");
		this.properties = { texture_name: "" };
	}

	LGraphTextureWebcam.title = "Webcam";
	LGraphTextureWebcam.desc = "Webcam texture";


	LGraphTextureWebcam.prototype.openStream = function()
	{
		//Vendor prefixes hell
		navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
		window.URL = window.URL || window.webkitURL;

		if (!navigator.getUserMedia) {
		  //console.log('getUserMedia() is not supported in your browser, use chrome and enable WebRTC from about://flags');
		  return;
		}

		this._waiting_confirmation = true;
		var that = this;

		// Not showing vendor prefixes.
		navigator.getUserMedia({video: true}, this.streamReady.bind(this), onFailSoHard);		

		function onFailSoHard(e) {
			console.log('Webcam rejected', e);
			that._webcam_stream = false;
			that.box_color = "red";
		};
	}

	LGraphTextureWebcam.prototype.streamReady = function(localMediaStream)
	{
		this._webcam_stream = localMediaStream;
		//this._waiting_confirmation = false;

	    var video = this._video;
		if(!video)
		{
			video = document.createElement("video");
			video.autoplay = true;
		    video.src = window.URL.createObjectURL( localMediaStream );
			this._video = video;
			//document.body.appendChild( video ); //debug
			//when video info is loaded (size and so)
			video.onloadedmetadata = function(e) {
				// Ready to go. Do some stuff.
				console.log(e);
			};
		}
	}

	LGraphTextureWebcam.prototype.onRemoved = function()
	{
		if(this._webcam_stream)
		{
			this._webcam_stream.stop();
			this._webcam_stream = null;
			this._video = null;
		}
	}

	LGraphTextureWebcam.prototype.onDrawBackground = function(ctx)
	{
		if(this.flags.collapsed || this.size[1] <= 20)
			return;

		if(!this._video)
			return;

		//render to graph canvas
		ctx.save();
		if(!ctx.webgl) //reverse image
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
			ctx.drawImage(this._video, 0, 0, this.size[0], this.size[1]);
		}
		else
		{
			if(this._temp_texture)
				ctx.drawImage(this._temp_texture, 0, 0, this.size[0], this.size[1]);
		}
		ctx.restore();
	}

	LGraphTextureWebcam.prototype.onExecute = function()
	{
		if(this._webcam_stream == null && !this._waiting_confirmation)
			this.openStream();

		if(!this._video || !this._video.videoWidth)
			return;

		var width = this._video.videoWidth;
		var height = this._video.videoHeight;

		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height )
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGB, filter: gl.LINEAR });

		this._temp_texture.uploadImage( this._video );
		
		if(this.properties.texture_name)
		{
			var container = LGraphTexture.getTexturesContainer();
			container[ this.properties.texture_name ] = this._temp_texture;
		}

		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/webcam", LGraphTextureWebcam );


	function LGraphTextureMatte()
	{
		this.addInput("in","Texture");

		this.addOutput("out","Texture");
		this.properties = { key_color: vec3.fromValues(0.,1.,0.), threshold: 0.8, slope: 0.2, precision: LGraphTexture.DEFAULT };

		if(!LGraphTextureMatte._shader)
			LGraphTextureMatte._shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphTextureMatte.pixel_shader );
	}

	LGraphTextureMatte.title = "Matte";
	LGraphTextureMatte.desc = "Extracts background";

	LGraphTextureMatte.widgets_info = { 
		"key_color": { widget:"color" },
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphTextureMatte.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		var tex = this.getInputData(0);

		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}		

		if(!tex)
			return;

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		if(!this._uniforms)
			this._uniforms = { u_texture: 0, u_key_color: this.properties.key_color, u_threshold: 1, u_slope: 1 };
		var uniforms = this._uniforms;

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureMatte._shader;

		uniforms.u_key_color = this.properties.key_color;
		uniforms.u_threshold = this.properties.threshold;
		uniforms.u_slope = this.properties.slope;

		this._tex.drawTo( function() {
			tex.bind(0);
			shader.uniforms( uniforms ).draw( mesh );
		});

		this.setOutputData( 0, this._tex );
	}

	LGraphTextureMatte.pixel_shader = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec3 u_key_color;\n\
			uniform float u_threshold;\n\
			uniform float u_slope;\n\
			\n\
			void main() {\n\
				vec3 color = texture2D( u_texture, v_coord ).xyz;\n\
				float diff = length( normalize(color) - normalize(u_key_color) );\n\
				float edge = u_threshold * (1.0 - u_slope);\n\
				float alpha = smoothstep( edge, u_threshold, diff);\n\
				gl_FragColor = vec4( color, alpha );\n\
			}";

	LiteGraph.registerNodeType("texture/matte", LGraphTextureMatte );

	//***********************************
	//Cubemap reader (to pass a cubemap to a node that requires cubemaps and no images)
	function LGraphCubemap()
	{
		this.addOutput("Cubemap","Cubemap");
		this.properties = {name:""};
		this.size = [LGraphTexture.image_preview_size, LGraphTexture.image_preview_size];
	}

	LGraphCubemap.prototype.onDropFile = function(data, filename, file)
	{
		if(!data)
		{
			this._drop_texture = null;
			this.properties.name = "";
		}
		else
		{
			if( typeof(data) == "string" )
				this._drop_texture = GL.Texture.fromURL(data);
			else
				this._drop_texture = GL.Texture.fromDDSInMemory(data);
			this.properties.name = filename;
		}
	}

	LGraphCubemap.prototype.onExecute = function()
	{
		if(this._drop_texture)
		{
			this.setOutputData(0, this._drop_texture);
			return;
		}

		if(!this.properties.name)
			return;

		var tex = LGraphTexture.getTexture( this.properties.name );
		if(!tex) 
			return;

		this._last_tex = tex;
		this.setOutputData(0, tex);
	}

	LGraphCubemap.prototype.onDrawBackground = function(ctx)
	{
		if( this.flags.collapsed || this.size[1] <= 20)
			return;

		if(!ctx.webgl)
			return;

		var cube_mesh = gl.meshes["cube"];
		if(!cube_mesh)
			cube_mesh = gl.meshes["cube"] = GL.Mesh.cube({size:1});

		//var view = mat4.lookAt( mat4.create(), [0,0
	}

	LiteGraph.registerNodeType("texture/cubemap", LGraphCubemap );

} //litegl.js defined
//Works with Litegl.js to create WebGL nodes
if(typeof(LiteGraph) != "undefined")
{
	
	// Texture Lens *****************************************
	function LGraphFXLens()
	{
		this.addInput("Texture","Texture");
		this.addInput("Aberration","number");
		this.addInput("Distortion","number");
		this.addInput("Blur","number");
		this.addOutput("Texture","Texture");
		this.properties = { aberration:1.0, distortion: 1.0, blur: 1.0, precision: LGraphTexture.DEFAULT };

		if(!LGraphFXLens._shader)
			LGraphFXLens._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphFXLens.pixel_shader );
	}

	LGraphFXLens.title = "Lens";
	LGraphFXLens.desc = "Camera Lens distortion";
	LGraphFXLens.widgets_info = {
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphFXLens.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}		

		if(!tex) return;

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		//iterations
		var aberration = this.properties.aberration;
		if( this.isInputConnected(1) )
		{
			aberration = this.getInputData(1);
			this.properties.aberration = aberration;
		}

		var distortion = this.properties.distortion;
		if( this.isInputConnected(2) )
		{
			distortion = this.getInputData(2);
			this.properties.distortion = distortion;
		}

		var blur = this.properties.blur;
		if( this.isInputConnected(3) )
		{
			blur = this.getInputData(3);
			this.properties.blur = blur;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphFXLens._shader;
		//var camera = LS.Renderer._current_camera;

		this._tex.drawTo( function() {
			tex.bind(0);
			shader.uniforms({u_texture:0, u_aberration: aberration, u_distortion: distortion, u_blur: blur })
				.draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphFXLens.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform float u_aberration;\n\
			uniform float u_distortion;\n\
			uniform float u_blur;\n\
			\n\
			void main() {\n\
				vec2 coord = v_coord;\n\
				float dist = distance(vec2(0.5), coord);\n\
				vec2 dist_coord = coord - vec2(0.5);\n\
				float percent = 1.0 + ((0.5 - dist) / 0.5) * u_distortion;\n\
				dist_coord *= percent;\n\
				coord = dist_coord + vec2(0.5);\n\
				vec4 color = texture2D(u_texture,coord, u_blur * dist);\n\
				color.r = texture2D(u_texture,vec2(0.5) + dist_coord * (1.0+0.01*u_aberration), u_blur * dist ).r;\n\
				color.b = texture2D(u_texture,vec2(0.5) + dist_coord * (1.0-0.01*u_aberration), u_blur * dist ).b;\n\
				gl_FragColor = color;\n\
			}\n\
			";
		/*
			float normalized_tunable_sigmoid(float xs, float k)\n\
			{\n\
				xs = xs * 2.0 - 1.0;\n\
				float signx = sign(xs);\n\
				float absx = abs(xs);\n\
				return signx * ((-k - 1.0)*absx)/(2.0*(-2.0*k*absx+k-1.0)) + 0.5;\n\
			}\n\
		*/

	LiteGraph.registerNodeType("fx/lens", LGraphFXLens );
	window.LGraphFXLens = LGraphFXLens;

	//*******************************************************

	function LGraphFXBokeh()
	{
		this.addInput("Texture","Texture");
		this.addInput("Blurred","Texture");
		this.addInput("Mask","Texture");
		this.addInput("Threshold","number");
		this.addOutput("Texture","Texture");
		this.properties = { shape: "", size: 10, alpha: 1.0, threshold: 1.0, high_precision: false };
	}

	LGraphFXBokeh.title = "Bokeh";
	LGraphFXBokeh.desc = "applies an Bokeh effect";

	LGraphFXBokeh.widgets_info = {"shape": { widget:"texture" }};

	LGraphFXBokeh.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		var blurred_tex = this.getInputData(1);
		var mask_tex = this.getInputData(2);
		if(!tex || !mask_tex || !this.properties.shape) 
		{
			this.setOutputData(0, tex);
			return;
		}

		if(!blurred_tex)
			blurred_tex = tex;

		var shape_tex = LGraphTexture.getTexture( this.properties.shape );
		if(!shape_tex)
			return;

		var threshold = this.properties.threshold;
		if( this.isInputConnected(3) )
		{
			threshold = this.getInputData(3);
			this.properties.threshold = threshold;
		}


		var precision = gl.UNSIGNED_BYTE;
		if(this.properties.high_precision)
			precision = gl.half_float_ext ? gl.HALF_FLOAT_OES : gl.FLOAT;			
		if(!this._temp_texture || this._temp_texture.type != precision ||
			this._temp_texture.width != tex.width || this._temp_texture.height != tex.height)
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: precision, format: gl.RGBA, filter: gl.LINEAR });

		//iterations
		var size = this.properties.size;

		var first_shader = LGraphFXBokeh._first_shader;
		if(!first_shader)
			first_shader = LGraphFXBokeh._first_shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphFXBokeh._first_pixel_shader );

		var second_shader = LGraphFXBokeh._second_shader;
		if(!second_shader)
			second_shader = LGraphFXBokeh._second_shader = new GL.Shader( LGraphFXBokeh._second_vertex_shader, LGraphFXBokeh._second_pixel_shader );

		var points_mesh = this._points_mesh;
		if(!points_mesh || points_mesh._width != tex.width || points_mesh._height != tex.height || points_mesh._spacing != 2)
			points_mesh = this.createPointsMesh( tex.width, tex.height, 2 );

		var screen_mesh = Mesh.getScreenQuad();

		var point_size = this.properties.size;
		var min_light = this.properties.min_light;
		var alpha = this.properties.alpha;

		gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );

		this._temp_texture.drawTo( function() {
			tex.bind(0);
			blurred_tex.bind(1);
			mask_tex.bind(2);
			first_shader.uniforms({u_texture:0, u_texture_blur:1, u_mask: 2, u_texsize: [tex.width, tex.height] })
				.draw(screen_mesh);
		});

		this._temp_texture.drawTo( function() {
			//clear because we use blending
			//gl.clearColor(0.0,0.0,0.0,1.0);
			//gl.clear( gl.COLOR_BUFFER_BIT );
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.ONE, gl.ONE );

			tex.bind(0);
			shape_tex.bind(3);
			second_shader.uniforms({u_texture:0, u_mask: 2, u_shape:3, u_alpha: alpha, u_threshold: threshold, u_pointSize: point_size, u_itexsize: [1.0/tex.width, 1.0/tex.height] })
				.draw(points_mesh, gl.POINTS);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphFXBokeh.prototype.createPointsMesh = function(width, height, spacing)
	{
		var nwidth = Math.round(width / spacing);
		var nheight = Math.round(height / spacing);

		var vertices = new Float32Array(nwidth * nheight * 2);

		var ny = -1;
		var dx = 2/width * spacing;
		var dy = 2/height * spacing;
		for(var y = 0; y < nheight; ++y )
		{
			var nx = -1;
			for(var x = 0; x < nwidth; ++x )
			{
				var pos = y*nwidth*2 + x*2;
				vertices[pos] = nx;
				vertices[pos+1] = ny;
				nx += dx;
			}
			ny += dy;
		}

		this._points_mesh = GL.Mesh.load({vertices2D: vertices});
		this._points_mesh._width = width;
		this._points_mesh._height = height;
		this._points_mesh._spacing = spacing;

		return this._points_mesh;
	}

	/*
	LGraphTextureBokeh._pixel_shader = "precision highp float;\n\
			varying vec2 a_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_shape;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D( u_texture, gl_PointCoord );\n\
				color *= v_color * u_alpha;\n\
				gl_FragColor = color;\n\
			}\n";
	*/

	LGraphFXBokeh._first_pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_texture_blur;\n\
			uniform sampler2D u_mask;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				vec4 blurred_color = texture2D(u_texture_blur, v_coord);\n\
				float mask = texture2D(u_mask, v_coord).x;\n\
			   gl_FragColor = mix(color, blurred_color, mask);\n\
			}\n\
			";

	LGraphFXBokeh._second_vertex_shader = "precision highp float;\n\
			attribute vec2 a_vertex2D;\n\
			varying vec4 v_color;\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_mask;\n\
			uniform vec2 u_itexsize;\n\
			uniform float u_pointSize;\n\
			uniform float u_threshold;\n\
			void main() {\n\
				vec2 coord = a_vertex2D * 0.5 + 0.5;\n\
				v_color = texture2D( u_texture, coord );\n\
				v_color += texture2D( u_texture, coord + vec2(u_itexsize.x, 0.0) );\n\
				v_color += texture2D( u_texture, coord + vec2(0.0, u_itexsize.y));\n\
				v_color += texture2D( u_texture, coord + u_itexsize);\n\
				v_color *= 0.25;\n\
				float mask = texture2D(u_mask, coord).x;\n\
				float luminance = length(v_color) * mask;\n\
				/*luminance /= (u_pointSize*u_pointSize)*0.01 */;\n\
				luminance -= u_threshold;\n\
				if(luminance < 0.0)\n\
				{\n\
					gl_Position.x = -100.0;\n\
					return;\n\
				}\n\
				gl_PointSize = u_pointSize;\n\
				gl_Position = vec4(a_vertex2D,0.0,1.0);\n\
			}\n\
			";

	LGraphFXBokeh._second_pixel_shader = "precision highp float;\n\
			varying vec4 v_color;\n\
			uniform sampler2D u_shape;\n\
			uniform float u_alpha;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D( u_shape, gl_PointCoord );\n\
				color *= v_color * u_alpha;\n\
				gl_FragColor = color;\n\
			}\n";


	LiteGraph.registerNodeType("fx/bokeh", LGraphFXBokeh );
	window.LGraphFXBokeh = LGraphFXBokeh;

	//************************************************

	function LGraphFXGeneric()
	{
		this.addInput("Texture","Texture");
		this.addInput("value1","number");
		this.addInput("value2","number");
		this.addOutput("Texture","Texture");
		this.properties = { fx: "halftone", value1: 1, value2: 1, precision: LGraphTexture.DEFAULT };
	}

	LGraphFXGeneric.title = "FX";
	LGraphFXGeneric.desc = "applies an FX from a list";

	LGraphFXGeneric.widgets_info = {
		"fx": { widget:"combo", values:["halftone","pixelate","lowpalette","noise","gamma"] },
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};
	LGraphFXGeneric.shaders = {};

	LGraphFXGeneric.prototype.onExecute = function()
	{
		if(!this.isOutputConnected(0))
			return; //saves work

		var tex = this.getInputData(0);
		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}		

		if(!tex)
			return;

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		//iterations
		var value1 = this.properties.value1;
		if( this.isInputConnected(1) )
		{
			value1 = this.getInputData(1);
			this.properties.value1 = value1;
		}

		var value2 = this.properties.value2;
		if( this.isInputConnected(2) )
		{
			value2 = this.getInputData(2);
			this.properties.value2 = value2;
		}
	
		var fx = this.properties.fx;
		var shader = LGraphFXGeneric.shaders[ fx ];
		if(!shader)
		{
			var pixel_shader_code = LGraphFXGeneric["pixel_shader_" + fx ];
			if(!pixel_shader_code)
				return;

			shader = LGraphFXGeneric.shaders[ fx ] = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, pixel_shader_code );
		}


		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var camera = window.LS ? LS.Renderer._current_camera : null;
		if(camera)
			camera_planes = [LS.Renderer._current_camera.near, LS.Renderer._current_camera.far];
		else
			camera_planes = [1,100];

		var noise = null;
		if(fx == "noise")
			noise = LGraphTexture.getNoiseTexture();

		this._tex.drawTo( function() {
			tex.bind(0);
			if(fx == "noise")
				noise.bind(1);

			shader.uniforms({u_texture:0, u_noise:1, u_size: [tex.width, tex.height], u_rand:[ Math.random(), Math.random() ], u_value1: value1, u_value2: value2, u_camera_planes: camera_planes })
				.draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphFXGeneric.pixel_shader_halftone = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform vec2 u_size;\n\
			uniform float u_value1;\n\
			uniform float u_value2;\n\
			\n\
			float pattern() {\n\
				float s = sin(u_value1 * 3.1415), c = cos(u_value1 * 3.1415);\n\
				vec2 tex = v_coord * u_size.xy;\n\
				vec2 point = vec2(\n\
				   c * tex.x - s * tex.y ,\n\
				   s * tex.x + c * tex.y \n\
				) * u_value2;\n\
				return (sin(point.x) * sin(point.y)) * 4.0;\n\
			}\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				float average = (color.r + color.g + color.b) / 3.0;\n\
				gl_FragColor = vec4(vec3(average * 10.0 - 5.0 + pattern()), color.a);\n\
			}\n";

	LGraphFXGeneric.pixel_shader_pixelate = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform vec2 u_size;\n\
			uniform float u_value1;\n\
			uniform float u_value2;\n\
			\n\
			void main() {\n\
				vec2 coord = vec2( floor(v_coord.x * u_value1) / u_value1, floor(v_coord.y * u_value2) / u_value2 );\n\
				vec4 color = texture2D(u_texture, coord);\n\
				gl_FragColor = color;\n\
			}\n";

	LGraphFXGeneric.pixel_shader_lowpalette = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform vec2 u_size;\n\
			uniform float u_value1;\n\
			uniform float u_value2;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				gl_FragColor = floor(color * u_value1) / u_value1;\n\
			}\n";

	LGraphFXGeneric.pixel_shader_noise = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_noise;\n\
			uniform vec2 u_size;\n\
			uniform float u_value1;\n\
			uniform float u_value2;\n\
			uniform vec2 u_rand;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				vec3 noise = texture2D(u_noise, v_coord * vec2(u_size.x / 512.0, u_size.y / 512.0) + u_rand).xyz - vec3(0.5);\n\
				gl_FragColor = vec4( color.xyz + noise * u_value1, color.a );\n\
			}\n";

	LGraphFXGeneric.pixel_shader_gamma = "precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform float u_value1;\n\
			\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				float gamma = 1.0 / u_value1;\n\
				gl_FragColor = vec4( pow( color.xyz, vec3(gamma) ), color.a );\n\
			}\n";


	LiteGraph.registerNodeType("fx/generic", LGraphFXGeneric );
	window.LGraphFXGeneric = LGraphFXGeneric;


	// Vigneting ************************************

	function LGraphFXVigneting()
	{
		this.addInput("Tex.","Texture");
		this.addInput("intensity","number");

		this.addOutput("Texture","Texture");
		this.properties = { intensity: 1, invert: false, precision: LGraphTexture.DEFAULT };

		if(!LGraphFXVigneting._shader)
			LGraphFXVigneting._shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, LGraphFXVigneting.pixel_shader );
	}

	LGraphFXVigneting.title = "Vigneting";
	LGraphFXVigneting.desc = "Vigneting";

	LGraphFXVigneting.widgets_info = { 
		"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
	};

	LGraphFXVigneting.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);

		if(this.properties.precision === LGraphTexture.PASS_THROUGH )
		{
			this.setOutputData(0,tex);
			return;
		}		

		if(!tex) return;

		this._tex = LGraphTexture.getTargetTexture( tex, this._tex, this.properties.precision );

		var intensity = this.properties.intensity;
		if( this.isInputConnected(1) )
		{
			intensity = this.getInputData(1);
			this.properties.intensity = intensity;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphFXVigneting._shader;
		var invert = this.properties.invert;

		this._tex.drawTo( function() {
			tex.bind(0);
			shader.uniforms({u_texture:0, u_intensity: intensity, u_isize:[1/tex.width,1/tex.height], u_invert: invert ? 1 : 0}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphFXVigneting.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform float u_intensity;\n\
			uniform int u_invert;\n\
			\n\
			void main() {\n\
				float luminance = 1.0 - length( v_coord - vec2(0.5) ) * 1.414;\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				if(u_invert == 1)\n\
					luminance = 1.0 - luminance;\n\
				luminance = mix(1.0, luminance, u_intensity);\n\
			   gl_FragColor = vec4( luminance * color.xyz, color.a);\n\
			}\n\
			";

	LiteGraph.registerNodeType("fx/vigneting", LGraphFXVigneting );
	window.LGraphFXVigneting = LGraphFXVigneting;
}
(function( global )
{

function MIDIEvent( data )
{
	this.channel = 0;
	this.cmd = 0;

	if(data)
		this.setup(data)
	else
		this.data = [0,0,0];
}

MIDIEvent.prototype.setup = function( raw_data )
{
	this.data = raw_data;

	var midiStatus = raw_data[0];
	this.status = midiStatus;

	var midiCommand = midiStatus & 0xF0;

	if(midiStatus >= 0xF0)
		this.cmd = midiStatus;
	else
		this.cmd = midiCommand;

	if(this.cmd == MIDIEvent.NOTEON && this.velocity == 0)
		this.cmd = MIDIEvent.NOTEOFF;

	this.cmd_str = MIDIEvent.commands[ this.cmd ] || "";

	if ( midiCommand >= MIDIEvent.NOTEON || midiCommand <= MIDIEvent.NOTEOFF ) {
		this.channel =  midiStatus & 0x0F;
	}
}

Object.defineProperty( MIDIEvent.prototype, "velocity", {
	get: function() {
		if(this.cmd == MIDIEvent.NOTEON)
			return this.data[2];
		return -1;
	},
	set: function(v) {
		this.data[2] = v; //  v / 127;
	},
	enumerable: true
});

MIDIEvent.notes = ["A","A#","B","C","C#","D","D#","E","F","F#","G","G#"];

//returns HZs
MIDIEvent.prototype.getPitch = function()
{
	return Math.pow(2, (this.data[1] - 69) / 12 ) * 440;
}

MIDIEvent.computePitch = function( note )
{
	return Math.pow(2, (note - 69) / 12 ) * 440;
}


//not tested, there is a formula missing here
MIDIEvent.prototype.getPitchBend = function()
{
	return this.data[1] + (this.data[2] << 7) - 8192;
}

MIDIEvent.computePitchBend = function(v1,v2)
{
	return v1 + (v2 << 7) - 8192;
}

MIDIEvent.prototype.setCommandFromString = function( str )
{
	this.cmd = MIDIEvent.computeCommandFromString(str);
}

MIDIEvent.computeCommandFromString = function( str )
{
	if(!str)
		return 0;

	if(str && str.constructor === Number)
		return str;

	str = str.toUpperCase();
	switch( str )
	{
		case "NOTE ON":
		case "NOTEON": return MIDIEvent.NOTEON; break;
		case "NOTE OFF":
		case "NOTEOFF": return MIDIEvent.NOTEON; break;
		case "KEY PRESSURE": 
		case "KEYPRESSURE": return MIDIEvent.KEYPRESSURE; break;
		case "CONTROLLER CHANGE": 
		case "CONTROLLERCHANGE": 
		case "CC": return MIDIEvent.CONTROLLERCHANGE; break;
		case "PROGRAM CHANGE":
		case "PROGRAMCHANGE":
		case "PC": return MIDIEvent.PROGRAMCHANGE; break;
		case "CHANNEL PRESSURE":
		case "CHANNELPRESSURE": return MIDIEvent.CHANNELPRESSURE; break;
		case "PITCH BEND":
		case "PITCHBEND": return MIDIEvent.PITCHBEND; break;
		case "TIME TICK":
		case "TIMETICK": return MIDIEvent.TIMETICK; break;
		default: return Number(str); //asume its a hex code
	}
}

MIDIEvent.toNoteString = function(d)
{
	var note = d - 21;
	var octave = d - 24;
	note = note % 12;
	if(note < 0)
		note = 12 + note;
	return MIDIEvent.notes[ note ] + Math.floor(octave / 12 + 1);
}

MIDIEvent.prototype.toString = function()
{
	var str = "" + this.channel + ". " ;
	switch( this.cmd )
	{
		case MIDIEvent.NOTEON: str += "NOTEON " + MIDIEvent.toNoteString( this.data[1] ); break;
		case MIDIEvent.NOTEOFF: str += "NOTEOFF " + MIDIEvent.toNoteString( this.data[1] ); break;
		case MIDIEvent.CONTROLLERCHANGE: str += "CC " + this.data[1] + " " + this.data[2]; break;
		case MIDIEvent.PROGRAMCHANGE: str += "PC " + this.data[1]; break;
		case MIDIEvent.PITCHBEND: str += "PITCHBEND " + this.getPitchBend(); break;
		case MIDIEvent.KEYPRESSURE: str += "KEYPRESS " + this.data[1]; break;
	}

	return str;
}

MIDIEvent.prototype.toHexString = function()
{
	var str = "";
	for(var i = 0; i < this.data.length; i++)
		str += this.data[i].toString(16) + " ";
}

MIDIEvent.NOTEOFF = 0x80;
MIDIEvent.NOTEON = 0x90;
MIDIEvent.KEYPRESSURE = 0xA0;
MIDIEvent.CONTROLLERCHANGE = 0xB0;
MIDIEvent.PROGRAMCHANGE = 0xC0;
MIDIEvent.CHANNELPRESSURE = 0xD0;
MIDIEvent.PITCHBEND = 0xE0;
MIDIEvent.TIMETICK = 0xF8;

MIDIEvent.commands = {
	0x80: "note off",
	0x90: "note on",
	0xA0: "key pressure",
	0xB0: "controller change",
	0xC0: "program change",
	0xD0: "channel pressure",
	0xE0: "pitch bend",
	0xF0: "system",
	0xF2: "Song pos",
	0xF3: "Song select",
	0xF6: "Tune request",
	0xF8: "time tick",
	0xFA: "Start Song",
	0xFB: "Continue Song",
	0xFC: "Stop Song",
	0xFE: "Sensing",
	0xFF: "Reset"
}

//MIDI wrapper
function MIDIInterface( on_ready, on_error )
{
	if(!navigator.requestMIDIAccess)
	{
		this.error = "not suppoorted";
		if(on_error)
			on_error("Not supported");
		else
			console.error("MIDI NOT SUPPORTED, enable by chrome://flags");
		return;
	}

	this.on_ready = on_ready;

	navigator.requestMIDIAccess().then( this.onMIDISuccess.bind(this), this.onMIDIFailure.bind(this) );
}

MIDIInterface.MIDIEvent = MIDIEvent;

MIDIInterface.prototype.onMIDISuccess = function(midiAccess)
{
	console.log( "MIDI ready!" );
	console.log( midiAccess );
	this.midi = midiAccess;  // store in the global (in real usage, would probably keep in an object instance)
	this.updatePorts();

	if (this.on_ready)
		this.on_ready(this);
}

MIDIInterface.prototype.updatePorts = function()
{
	var midi = this.midi;
	this.input_ports = midi.inputs;
	var num = 0;
	for (var i = 0; i < this.input_ports.size; ++i) {
		  var input = this.input_ports.get(i);
			console.log( "Input port [type:'" + input.type + "'] id:'" + input.id +
		  "' manufacturer:'" + input.manufacturer + "' name:'" + input.name +
		  "' version:'" + input.version + "'" );
			num++;
	  }
	this.num_input_ports = num;


	num = 0;
	this.output_ports = midi.outputs;
	for (var i = 0; i < this.output_ports.size; ++i) {
		  var output = this.output_ports.get(i);
		console.log( "Output port [type:'" + output.type + "'] id:'" + output.id +
		  "' manufacturer:'" + output.manufacturer + "' name:'" + output.name +
		  "' version:'" + output.version + "'" );
			num++;
	  }
	this.num_output_ports = num;
}

MIDIInterface.prototype.onMIDIFailure = function(msg)
{
	console.error( "Failed to get MIDI access - " + msg );
}

MIDIInterface.prototype.openInputPort = function( port, callback)
{
	var input_port = this.input_ports.get( port );
	if(!input_port)
		return false;

	input_port.onmidimessage = function(a) {
		var midi_event = new MIDIEvent(a.data);
		if(callback)
			callback(a.data, midi_event );
		if(MIDIInterface.on_message)
			MIDIInterface.on_message( a.data, midi_event );
	}
	console.log("port open: ", input_port);
	return true;
}

MIDIInterface.parseMsg = function(data)
{

}

MIDIInterface.prototype.sendMIDI = function( port, midi_data )
{
	if( !midi_data )
		return;

	var output_port = this.output_ports.get(port);
	if(!output_port)
		return;

	if( midi_data.constructor === MIDIEvent)
		output_port.send( midi_data.data ); 
	else
		output_port.send( midi_data ); 
}



function LGMIDIIn()
{
	this.addOutput( "on_midi", LiteGraph.EVENT );
	this.addOutput( "out", "midi" );
	this.properties = {port: 0};
	this._last_midi_event = null;
	this._current_midi_event = null;

	var that = this;
	new MIDIInterface( function( midi ){
		//open
		that._midi = midi;
		if(that._waiting)
			that.onStart();
		that._waiting = false;
	});
}

LGMIDIIn.MIDIInterface = MIDIInterface;

LGMIDIIn.title = "MIDI Input";
LGMIDIIn.desc = "Reads MIDI from a input port";

LGMIDIIn.prototype.getPropertyInfo = function(name)
{
	if(!this._midi)
		return;

	if(name == "port")
	{
		var values = {};
		for (var i = 0; i < this._midi.input_ports.size; ++i)
		{
			var input = this._midi.input_ports.get(i);
			values[i] = i + ".- " + input.name + " version:" + input.version;
		}
		return { type: "enum", values: values };
	}
}

LGMIDIIn.prototype.onStart = function()
{
	if(this._midi)
		this._midi.openInputPort( this.properties.port, this.onMIDIEvent.bind(this) );
	else
		this._waiting = true;
}

LGMIDIIn.prototype.onMIDIEvent = function( data, midi_event )
{
	this._last_midi_event = midi_event;

	this.trigger( "on_midi", midi_event );
	if(midi_event.cmd == MIDIEvent.NOTEON)
		this.trigger( "on_noteon", midi_event );
	else if(midi_event.cmd == MIDIEvent.NOTEOFF)
		this.trigger( "on_noteoff", midi_event );
	else if(midi_event.cmd == MIDIEvent.CONTROLLERCHANGE)
		this.trigger( "on_cc", midi_event );
	else if(midi_event.cmd == MIDIEvent.PROGRAMCHANGE)
		this.trigger( "on_pc", midi_event );
	else if(midi_event.cmd == MIDIEvent.PITCHBEND)
		this.trigger( "on_pitchbend", midi_event );
}

LGMIDIIn.prototype.onExecute = function()
{
	if(this.outputs)
	{
		var last = this._last_midi_event;
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			var v = null;
			switch (output.name)
			{
				case "last_midi": v = last; break;
				default:
					continue;
			}
			this.setOutputData( i, v );
		}
	}
}

LGMIDIIn.prototype.onGetOutputs = function() {
	return [
		["last_midi","midi"],
		["on_midi",LiteGraph.EVENT],
		["on_noteon",LiteGraph.EVENT],
		["on_noteoff",LiteGraph.EVENT],
		["on_cc",LiteGraph.EVENT],
		["on_pc",LiteGraph.EVENT],
		["on_pitchbend",LiteGraph.EVENT]
	];
}

LiteGraph.registerNodeType("midi/input", LGMIDIIn);


function LGMIDIOut()
{
	this.addInput( "send", LiteGraph.EVENT );
	this.properties = {port: 0};

	var that = this;
	new MIDIInterface( function( midi ){
		that._midi = midi;
	});
}

LGMIDIOut.MIDIInterface = MIDIInterface;

LGMIDIOut.title = "MIDI Output";
LGMIDIOut.desc = "Sends MIDI to output channel";

LGMIDIOut.prototype.getPropertyInfo = function(name)
{
	if(!this._midi)
		return;

	if(name == "port")
	{
		var values = {};
		for (var i = 0; i < this._midi.output_ports.size; ++i)
		{
			var output = this._midi.output_ports.get(i);
			values[i] = i + ".- " + output.name + " version:" + output.version;
		}
		return { type: "enum", values: values };
	}
}


LGMIDIOut.prototype.onAction = function(event, midi_event )
{
	console.log(midi_event);
	if(!this._midi)
		return;
	if(event == "send")
		this._midi.sendMIDI( this.port, midi_event );
	this.trigger("midi",midi_event);
}

LGMIDIOut.prototype.onGetInputs = function() {
	return [["send",LiteGraph.ACTION]];
}

LGMIDIOut.prototype.onGetOutputs = function() {
	return [["on_midi",LiteGraph.EVENT]];
}

LiteGraph.registerNodeType("midi/output", LGMIDIOut);


function LGMIDIShow()
{
	this.addInput( "on_midi", LiteGraph.EVENT );
	this._str = "";
	this.size = [200,40]
}

LGMIDIShow.title = "MIDI Show";
LGMIDIShow.desc = "Shows MIDI in the graph";

LGMIDIShow.prototype.onAction = function(event, midi_event )
{
	if(!midi_event)
		return;
	if(midi_event.constructor === MIDIEvent)
		this._str = midi_event.toString();
	else
		this._str = "???";
}

LGMIDIShow.prototype.onDrawForeground = function( ctx )
{
	if( !this._str )
		return;

	ctx.font = "30px Arial";
	ctx.fillText( this._str, 10, this.size[1] * 0.8 );
}

LGMIDIShow.prototype.onGetInputs = function() {
	return [["in",LiteGraph.ACTION]];
}

LGMIDIShow.prototype.onGetOutputs = function() {
	return [["on_midi",LiteGraph.EVENT]];
}

LiteGraph.registerNodeType("midi/show", LGMIDIShow);



function LGMIDIFilter()
{
	this.properties = {
		channel: -1,
		cmd: -1,
		min_value: -1,
		max_value: -1
	};

	this.addInput( "in", LiteGraph.EVENT );
	this.addOutput( "on_midi", LiteGraph.EVENT );
}

LGMIDIFilter.title = "MIDI Filter";
LGMIDIFilter.desc = "Filters MIDI messages";

LGMIDIFilter.prototype.onAction = function(event, midi_event )
{
	if(!midi_event || midi_event.constructor !== MIDIEvent)
		return;

	if( this.properties.channel != -1 && midi_event.channel != this.properties.channel)
		return;
	if(this.properties.cmd != -1 && midi_event.cmd != this.properties.cmd)
		return;
	if(this.properties.min_value != -1 && midi_event.data[1] < this.properties.min_value)
		return;
	if(this.properties.max_value != -1 && midi_event.data[1] > this.properties.max_value)
		return;
	this.trigger("on_midi",midi_event);
}

LiteGraph.registerNodeType("midi/filter", LGMIDIFilter);


function LGMIDIEvent()
{
	this.properties = {
		channel: 0,
		cmd: "CC",
		value1: 1,
		value2: 1
	};

	this.addInput( "send", LiteGraph.EVENT );
	this.addInput( "assign", LiteGraph.EVENT );
	this.addOutput( "on_midi", LiteGraph.EVENT );
}

LGMIDIEvent.title = "MIDIEvent";
LGMIDIEvent.desc = "Create a MIDI Event";

LGMIDIEvent.prototype.onAction = function( event, midi_event )
{
	if(event == "assign")
	{
		this.properties.channel = midi_event.channel;
		this.properties.cmd = midi_event.cmd;
		this.properties.value1 = midi_event.data[1];
		this.properties.value2 = midi_event.data[2];
		return;
	}

	//send
	var midi_event = new MIDIEvent();
	midi_event.channel = this.properties.channel;
	if(this.properties.cmd && this.properties.cmd.constructor === String)
		midi_event.setCommandFromString( this.properties.cmd );
	else
		midi_event.cmd = this.properties.cmd;
	midi_event.data[0] = midi_event.cmd | midi_event.channel;
	midi_event.data[1] = Number(this.properties.value1);
	midi_event.data[2] = Number(this.properties.value2);
	this.trigger("on_midi",midi_event);
}

LGMIDIEvent.prototype.onExecute = function()
{
	var props = this.properties;

	if(this.outputs)
	{
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			var v = null;
			switch (output.name)
			{
				case "midi": 
					v = new MIDIEvent(); 
					v.setup([ props.cmd, props.value1, props.value2 ]);
					v.channel = props.channel;
					break;
				case "command": v = props.cmd; break;
				case "note": v = (props.cmd == MIDIEvent.NOTEON || props.cmd == MIDIEvent.NOTEOFF) ? props.value1 : NULL; break;
				case "velocity": v = props.cmd == MIDIEvent.NOTEON ? props.value2 : NULL; break;
				case "pitch": v = props.cmd == MIDIEvent.NOTEON ? MIDIEvent.computePitch( props.value1 ) : null; break;
				case "pitchbend": v = props.cmd == MIDIEvent.PITCHBEND ? MIDIEvent.computePitchBend( props.value1, props.value2 ) : null; break;
				default:
					continue;
			}
			if(v !== null)
				this.setOutputData( i, v );
		}
	}
}

LGMIDIEvent.prototype.onPropertyChanged = function(name,value)
{
	if(name == "cmd")
		this.properties.cmd = MIDIEvent.computeCommandFromString( value );
}


LGMIDIEvent.prototype.onGetOutputs = function() {
	return [
		["midi","midi"],
		["on_midi",LiteGraph.EVENT],
		["command","number"],
		["note","number"],
		["velocity","number"],
		["pitch","number"],
		["pitchbend","number"]
	];
}


LiteGraph.registerNodeType("midi/event", LGMIDIEvent);




function now() { return window.performance.now() }







})( window );
//not tested nor finished

(function( global )
{

var LGAudio = {};
global.LGAudio = LGAudio;

LGAudio.getAudioContext = function()
{
	if(!this._audio_context)
	{
		window.AudioContext = window.AudioContext || window.webkitAudioContext;
		if(!window.AudioContext)
		{
			console.error("AudioContext not supported by browser");
			return null;
		}
		this._audio_context = new AudioContext();	
		this._audio_context.onmessage = function(msg) { console.log("msg",msg);};
		this._audio_context.onended = function(msg) { console.log("ended",msg);};
		this._audio_context.oncomplete = function(msg) { console.log("complete",msg);};
	}

	//in case it crashes
	if(this._audio_context.state == "suspended")
		this._audio_context.resume();
	return this._audio_context;
}

LGAudio.connect = function( audionodeA, audionodeB )
{
	try
	{
		audionodeA.connect( audionodeB );
	}
	catch (err)
	{
		console.warn("LGraphAudio:",err);
	}
}

LGAudio.disconnect = function( audionodeA, audionodeB )
{
	try
	{
		audionodeA.disconnect( audionodeB );
	}
	catch (err)
	{
		console.warn("LGraphAudio:",err);
	}
}

LGAudio.changeAllAudiosConnections = function( node, connect )
{
	if(node.inputs)
	{
		for(var i = 0; i < node.inputs.length; ++i)
		{
			var input = node.inputs[i];
			var link_info = node.graph.links[ input.link ];
			if(!link_info)
				continue;

			var origin_node = node.graph.getNodeById( link_info.origin_id );
			var origin_audionode = null;
			if( origin_node.getAudioNodeInOutputSlot )
				origin_audionode = origin_node.getAudioNodeInOutputSlot( link_info.origin_slot );
			else
				origin_audionode = origin_node.audionode;

			var target_audionode = null;
			if( node.getAudioNodeInInputSlot )
				target_audionode = node.getAudioNodeInInputSlot( i );
			else
				target_audionode = node.audionode;

			if(connect)
				LGAudio.connect( origin_audionode, target_audionode );
			else
				LGAudio.disconnect( origin_audionode, target_audionode );
		}
	}

	if(node.outputs)
	{
		for(var i = 0; i < node.outputs.length; ++i)
		{
			var output = node.outputs[i];
			for(var j = 0; j < output.links.length; ++j)
			{
				var link_info = node.graph.links[ output.links[j] ];
				if(!link_info)
					continue;

				var origin_audionode = null;
				if( node.getAudioNodeInOutputSlot )
					origin_audionode = node.getAudioNodeInOutputSlot( i );
				else
					origin_audionode = node.audionode;

				var target_node = node.graph.getNodeById( link_info.target_id );
				var target_audionode = null;
				if( target_node.getAudioNodeInInputSlot )
					target_audionode = target_node.getAudioNodeInInputSlot( link_info.target_slot );
				else
					target_audionode = target_node.audionode;

				if(connect)
					LGAudio.connect( origin_audionode, target_audionode );
				else
					LGAudio.disconnect( origin_audionode, target_audionode );
			}
		}
	}
}

//used by many nodes
LGAudio.onConnectionsChange = function( connection, slot, connected, link_info )
{
	//only process the outputs events
	if(connection != LiteGraph.OUTPUT)
		return;

	var target_node = null;
	if( link_info )
		target_node = this.graph.getNodeById( link_info.target_id );

	if( !target_node )
		return;

	//get origin audionode
	var local_audionode = null;
	if(this.getAudioNodeInOutputSlot)
		local_audionode = this.getAudioNodeInOutputSlot( slot );
	else
		local_audionode = this.audionode;

	//get target audionode
	var target_audionode = null;
	if(target_node.getAudioNodeInInputSlot)
		target_audionode = target_node.getAudioNodeInInputSlot( link_info.target_slot );
	else
		target_audionode = target_node.audionode;

	//do the connection/disconnection
	if( connected )	
		LGAudio.connect( local_audionode, target_audionode );
	else
		LGAudio.disconnect( local_audionode, target_audionode );
}

//this function helps creating wrappers to existing classes
LGAudio.createAudioNodeWrapper = function( class_object )
{
	class_object.prototype.onPropertyChanged = function(name, value)
	{
		if(!this.audionode)
			return;

		if( this.audionode[ name ] === undefined )
			return;

		if( this.audionode[ name ].value !== undefined )
			this.audionode[ name ].value = value;
		else
			this.audionode[ name ] = value;
	}

	class_object.prototype.onConnectionsChange = LGAudio.onConnectionsChange;
}


LGAudio.cached_audios = {};

LGAudio.loadSound = function( url, on_complete, on_error )
{
	if( LGAudio.cached_audios[ url ] && url.indexOf("blob:") == -1 )
	{
		if(on_complete)
			on_complete( LGAudio.cached_audios[ url ] );
		return;
	}

	//load new sample
	var request = new XMLHttpRequest();
	request.open('GET', url, true);
	request.responseType = 'arraybuffer';

	var context = LGAudio.getAudioContext();

	// Decode asynchronously
	request.onload = function() {
		console.log("AudioSource loaded");
		context.decodeAudioData( request.response, function( buffer ) {
			console.log("AudioSource decoded");
			LGAudio.cached_audios[ url ] = buffer;
			if(on_complete)
				on_complete( buffer );
		}, onError);
	}
	request.send();

	function onError(err)
	{
		console.log("Audio loading sample error:",err);
		if(on_error)
			on_error(err);
	}

	return request;
}


//****************************************************

function LGAudioSource()
{
	this.properties = {
		src: "",
		gain: 0.5,
		loop: true,
		autoplay: true,
		playbackRate: 1
	};

	this._loading_audio = false;
	this._audio_buffer = null;
	this._audionodes = [];

	this.addOutput( "out", "audio" );
	this.addInput( "gain", "number" );

	//init context
	var context = LGAudio.getAudioContext();

	//create gain node
	this.audionode = context.createGain();
	this.audionode.graphnode = this;
	this.audionode.gain.value = this.properties.gain;

	//debug
	if(this.properties.src)
		this.loadSound( this.properties.src );
}

LGAudioSource.supported_extensions = ["wav","ogg","mp3"];


LGAudioSource.prototype.onAdded = function(graph)
{
	if(graph.status === LGraph.STATUS_RUNNING)
		this.onStart();
}

LGAudioSource.prototype.onStart = function()
{
	if(!this._audio_buffer)
		return;

	if(this.properties.autoplay)
		this.playBuffer( this._audio_buffer );
}

LGAudioSource.prototype.onStop = function()
{
	this.stopAllSounds();
}

LGAudioSource.prototype.onRemoved = function()
{
	this.stopAllSounds();
	if(this._dropped_url)
		URL.revokeObjectURL( this._url );
}

LGAudioSource.prototype.stopAllSounds = function()
{
	//iterate and stop
	for(var i = 0; i < this._audionodes.length; ++i )
	{
		this._audionodes[i].stop();
		//this._audionodes[i].disconnect( this.audionode );
	}
	this._audionodes.length = 0;
}

LGAudioSource.prototype.onExecute = function()
{
	if(!this.inputs)
		return;

	for(var i = 0; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];
		if(!input.link)
			continue;
		var v = this.getInputData(i);
		if( v === undefined )
			continue;
		if( input.name == "gain" )
			this.audionode.gain.value = v;
		else if( input.name == "playbackRate" )
			this.properties.playbackRate = v;
	}
}

LGAudioSource.prototype.onAction = function(event)
{
	if(this._audio_buffer)
	{
		if(event == "Play")
			this.playBuffer(this._audio_buffer);
		else if(event == "Stop")
			this.stopAllSounds();
	}
}

LGAudioSource.prototype.onPropertyChanged = function( name, value )
{
	if( name == "src" ) 
		this.loadSound( value );
	else if(name == "gain")
		this.audionode.gain.value = value;
}

LGAudioSource.prototype.playBuffer = function( buffer )
{
	var that = this;
	var context = LGAudio.getAudioContext();

	//create a new audionode (this is mandatory, AudioAPI doesnt like to reuse old ones)
	var audionode = context.createBufferSource(); //create a AudioBufferSourceNode
	audionode.graphnode = this;
	audionode.buffer = buffer;
	audionode.loop = this.properties.loop;
	audionode.playbackRate.value = this.properties.playbackRate;
	this._audionodes.push( audionode );
	audionode.connect( this.audionode ); //connect to gain
	this._audionodes.push( audionode );

	audionode.onended = function()
	{
		//console.log("ended!");
		that.trigger("ended");
		//remove
		var index = that._audionodes.indexOf( audionode );
		if(index != -1)
			that._audionodes.splice(index,1);
	}

	audionode.start();
	return audionode;
}

LGAudioSource.prototype.loadSound = function( url )
{
	var that = this;

	//kill previous load
	if(this._request)
	{
		this._request.abort();
		this._request = null;
	}

	this._audio_buffer = null;
	this._loading_audio = false;

	if(!url)
		return;

	this._request = LGAudio.loadSound( url, inner );

	this._loading_audio = true;
	this.boxcolor = "#AA4";

	function inner( buffer )
	{
		this.boxcolor = LiteGraph.NODE_DEFAULT_BOXCOLOR;
		that._audio_buffer = buffer;
		that._loading_audio = false;
		//if is playing, then play it
		if(that.graph && that.graph.status === LGraph.STATUS_RUNNING)
			that.onStart(); //this controls the autoplay already
	}
}

//Helps connect/disconnect AudioNodes when new connections are made in the node
LGAudioSource.prototype.onConnectionsChange = LGAudio.onConnectionsChange;

LGAudioSource.prototype.onGetInputs = function()
{
	return [["playbackRate","number"],["Play",LiteGraph.ACTION],["Stop",LiteGraph.ACTION]];
}

LGAudioSource.prototype.onGetOutputs = function()
{
	return [["ended",LiteGraph.EVENT]];
}

LGAudioSource.prototype.onDropFile = function(file)
{
	if(this._dropped_url)
		URL.revokeObjectURL( this._dropped_url );
	var url = URL.createObjectURL( file );
	this.properties.src = url;
	this.loadSound( url );
	this._dropped_url = url;
}


LGAudioSource.title = "Source";
LGAudioSource.desc = "Plays audio";
LiteGraph.registerNodeType("audio/source", LGAudioSource);


//*****************************************************

function LGAudioAnalyser()
{
	this.properties = {
		fftSize: 2048,
		minDecibels: -100,
		maxDecibels: -10,
		smoothingTimeConstant: 0.5
	};

	var context = LGAudio.getAudioContext();

	this.audionode = context.createAnalyser();
	this.audionode.graphnode = this;
	this.audionode.fftSize = this.properties.fftSize;
	this.audionode.minDecibels = this.properties.minDecibels;
	this.audionode.maxDecibels = this.properties.maxDecibels;
	this.audionode.smoothingTimeConstant = this.properties.smoothingTimeConstant;

	this.addInput("in","audio");
	this.addOutput("freqs","array");
	//this.addOutput("time","freq");

	this._freq_bin = null;
	this._time_bin = null;
}

LGAudioAnalyser.prototype.onPropertyChanged = function(name, value)
{
	this.audionode[ name ] = value;
}

LGAudioAnalyser.prototype.onExecute = function()
{
	if(this.isOutputConnected(0))
	{
		//send FFT
		var bufferLength = this.audionode.frequencyBinCount;
		if( !this._freq_bin || this._freq_bin.length != bufferLength )
			this._freq_bin = new Uint8Array( bufferLength );
		this.audionode.getByteFrequencyData( this._freq_bin );
		this.setOutputData(0,this._freq_bin);
	}

	//send analyzer
	if(this.isOutputConnected(1))
		this.setOutputData(1,this.audionode);


	//properties
	for(var i = 1; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];
		if(!input.link)
			continue;
		var v = this.getInputData(i);
		if (v !== undefined)
			this.audionode[ input.name ].value = v;
	}



	//time domain
	//this.audionode.getFloatTimeDomainData( dataArray );
}

LGAudioAnalyser.prototype.onGetInputs = function()
{
	return [["minDecibels","number"],["maxDecibels","number"],["smoothingTimeConstant","number"]];
}

/*
LGAudioAnalyser.prototype.onGetOutputs = function()
{
	return [["Analyzer","analyzer"]];
}
*/

LGAudioAnalyser.title = "Analyser";
LGAudioAnalyser.desc = "Audio Analyser";
LiteGraph.registerNodeType( "audio/analyser", LGAudioAnalyser );

//*****************************************************

function LGAudioGain()
{
	//default 
	this.properties = {
		gain: 1
	};

	this.audionode = LGAudio.getAudioContext().createGain();
	this.addInput("in","audio");
	this.addInput("gain","number");
	this.addOutput("out","audio");
}

LGAudioGain.prototype.onExecute = function()
{
	if(!this.inputs || !this.inputs.length)
		return;

	for(var i = 1; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];
		var v = this.getInputData(i);
		if(v !== undefined)
			this.audionode[ input.name ].value = v;
	}
}

LGAudio.createAudioNodeWrapper( LGAudioGain );

LGAudioGain.title = "Gain";
LGAudioGain.desc = "Audio gain";
LiteGraph.registerNodeType("audio/gain", LGAudioGain);


function LGAudioConvolver()
{
	//default 
	this.properties = {
		impulse_src:"",
		normalize: true
	};

	this.audionode = LGAudio.getAudioContext().createConvolver();
	this.addInput("in","audio");
	this.addOutput("out","audio");
}

LGAudio.createAudioNodeWrapper( LGAudioConvolver );

LGAudioConvolver.prototype.onRemove = function()
{
	if(this._dropped_url)
		URL.revokeObjectURL( this._dropped_url );
}

LGAudioConvolver.prototype.onPropertyChanged = function( name, value )
{
	if( name == "impulse_src" ) 
		this.loadImpulse( value );
	else if( name == "normalize" ) 
		this.audionode.normalize = value;
}

LGAudioConvolver.prototype.onDropFile = function(file)
{
	if(this._dropped_url)
		URL.revokeObjectURL( this._dropped_url );
	this._dropped_url = URL.createObjectURL( file );
	this.properties.impulse_src = this._dropped_url;
	this.loadImpulse( this._dropped_url );
}

LGAudioConvolver.prototype.loadImpulse = function( url )
{
	var that = this;

	//kill previous load
	if(this._request)
	{
		this._request.abort();
		this._request = null;
	}

	this._impulse_buffer = null;
	this._loading_impulse = false;

	if(!url)
		return;

	//load new sample
	this._request = LGAudio.loadSound( url, inner );
	this._loading_impulse = true;

	// Decode asynchronously
	function inner( buffer ) {
			that._impulse_buffer = buffer;
			that.audionode.buffer = buffer;
			console.log("Impulse signal set");
			that._loading_impulse = false;
	}
}

LGAudioConvolver.title = "Convolver";
LGAudioConvolver.desc = "Convolves the signal (used for reverb)";
LiteGraph.registerNodeType("audio/convolver", LGAudioConvolver);


function LGAudioDynamicsCompressor()
{
	//default 
	this.properties = {
		threshold: -50,
		knee: 40,
		ratio: 12,
		reduction: -20,
		attack: 0,
		release: 0.25
	};

	this.audionode = LGAudio.getAudioContext().createDynamicsCompressor();
	this.addInput("in","audio");
	this.addOutput("out","audio");
}

LGAudio.createAudioNodeWrapper( LGAudioDynamicsCompressor );

LGAudioDynamicsCompressor.prototype.onExecute = function()
{
	if(!this.inputs || !this.inputs.length)
		return;
	for(var i = 1; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];
		if(!input.link)
			continue;
		var v = this.getInputData(i);
		if(v !== undefined)
			this.audionode[ input.name ].value = v;
	}
}

LGAudioDynamicsCompressor.prototype.onGetInputs = function()
{
	return [["threshold","number"],["knee","number"],["ratio","number"],["reduction","number"],["attack","number"],["release","number"]];
}

LGAudioDynamicsCompressor.title = "DynamicsCompressor";
LGAudioDynamicsCompressor.desc = "Dynamics Compressor";
LiteGraph.registerNodeType("audio/dynamicsCompressor", LGAudioDynamicsCompressor);


function LGAudioWaveShaper()
{
	//default 
	this.properties = {
	};

	this.audionode = LGAudio.getAudioContext().createWaveShaper();
	this.addInput("in","audio");
	this.addInput("shape","waveshape");
	this.addOutput("out","audio");
}

LGAudioWaveShaper.prototype.onExecute = function()
{
	if(!this.inputs || !this.inputs.length)
		return;
	var v = this.getInputData(1);
	if(v === undefined)
		return;
	this.audionode.curve = v;
}

LGAudioWaveShaper.prototype.setWaveShape = function(shape)
{
	this.audionode.curve = shape;
}

LGAudio.createAudioNodeWrapper( LGAudioWaveShaper );

/* disabled till I dont find a way to do a wave shape
LGAudioWaveShaper.title = "WaveShaper";
LGAudioWaveShaper.desc = "Distortion using wave shape";
LiteGraph.registerNodeType("audio/waveShaper", LGAudioWaveShaper);
*/

function LGAudioMixer()
{
	//default 
	this.properties = {
		gain1: 0.5,
		gain2: 0.5
	};

	this.audionode = LGAudio.getAudioContext().createGain();

	this.audionode1 = LGAudio.getAudioContext().createGain();
	this.audionode1.gain.value = this.properties.gain1;
	this.audionode2 = LGAudio.getAudioContext().createGain();
	this.audionode2.gain.value = this.properties.gain2;

	this.audionode1.connect( this.audionode );
	this.audionode2.connect( this.audionode );

	this.addInput("in1","audio");
	this.addInput("in1 gain","number");
	this.addInput("in2","audio");
	this.addInput("in2 gain","number");

	this.addOutput("out","audio");
}

LGAudioMixer.prototype.getAudioNodeInInputSlot = function( slot )
{
	if(slot == 0)
		return this.audionode1;
	else if(slot == 2)
		return this.audionode2;
}

LGAudioMixer.prototype.onExecute = function()
{
	if(!this.inputs || !this.inputs.length)
		return;

	for(var i = 1; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];

		if(!input.link || input.type == "audio")
			continue;

		var v = this.getInputData(i);
		if(v === undefined)
			continue;

		if(i == 1)
			this.audionode1.gain.value = v;
		else if(i == 3)
			this.audionode2.gain.value = v;
	}
}

LGAudio.createAudioNodeWrapper( LGAudioMixer );

LGAudioMixer.title = "Mixer";
LGAudioMixer.desc = "Audio mixer";
LiteGraph.registerNodeType("audio/mixer", LGAudioMixer);


function LGAudioDelay()
{
	//default 
	this.properties = {
		delayTime: 0.5
	};

	this.audionode = LGAudio.getAudioContext().createDelay( 10 );
	this.audionode.delayTime.value = this.properties.delayTime;
	this.addInput("in","audio");
	this.addInput("time","number");
	this.addOutput("out","audio");
}

LGAudio.createAudioNodeWrapper( LGAudioDelay );

LGAudioDelay.prototype.onExecute = function()
{
	var v = this.getInputData(1);
	if(v !== undefined )
		this.audionode.delayTime.value = v;
}

LGAudioDelay.title = "Delay";
LGAudioDelay.desc = "Audio delay";
LiteGraph.registerNodeType("audio/delay", LGAudioDelay);


function LGAudioBiquadFilter()
{
	//default 
	this.properties = {
		frequency: 350,
		detune: 0,
		Q: 1
	};
	this.addProperty("type","lowpass","enum",{values:["lowpass","highpass","bandpass","lowshelf","highshelf","peaking","notch","allpass"]});	

	//create node
	this.audionode = LGAudio.getAudioContext().createBiquadFilter();

	//slots
	this.addInput("in","audio");
	this.addOutput("out","audio");
}

LGAudioBiquadFilter.prototype.onExecute = function()
{
	if(!this.inputs || !this.inputs.length)
		return;

	for(var i = 1; i < this.inputs.length; ++i)
	{
		var input = this.inputs[i];
		if(!input.link)
			continue;
		var v = this.getInputData(i);
		if(v !== undefined)
			this.audionode[ input.name ].value = v;
	}
}

LGAudioBiquadFilter.prototype.onGetInputs = function()
{
	return [["frequency","number"],["detune","number"],["Q","number"]];
}

LGAudio.createAudioNodeWrapper( LGAudioBiquadFilter );

LGAudioBiquadFilter.title = "BiquadFilter";
LGAudioBiquadFilter.desc = "Audio filter";
LiteGraph.registerNodeType("audio/biquadfilter", LGAudioBiquadFilter);


//*****************************************************

//EXTRA 


function LGAudioVisualization()
{
	this.properties = {
		continuous: true,
		mark: -1
	};

	this.addInput("freqs","array");
	this.addInput("mark","number");
	this.size = [300,200];
	this._last_buffer = null;
}

LGAudioVisualization.prototype.onExecute = function()
{
	this._last_buffer = this.getInputData(0);
	var v = this.getInputData(1);
	if(v !== undefined)
		this.properties.mark = v;
	this.setDirtyCanvas(true,false);
}

LGAudioVisualization.prototype.onDrawForeground = function(ctx)
{
	if(!this._last_buffer)
		return;

	var buffer = this._last_buffer;

	//delta represents how many samples we advance per pixel
	var delta = buffer.length / this.size[0];
	var h = this.size[1];

	ctx.fillStyle = "black";
	ctx.fillRect(0,0,this.size[0],this.size[1]);
	ctx.strokeStyle = "white";
	ctx.beginPath();
	var x = 0;

	if(this.properties.continuous)
	{
		ctx.moveTo(x,h);
		for(var i = 0; i < buffer.length; i+= delta)
		{
			ctx.lineTo(x,h - (buffer[i|0]/255) * h);
			x++;
		}
	}
	else
	{
		for(var i = 0; i < buffer.length; i+= delta)
		{
			ctx.moveTo(x+0.5,h);
			ctx.lineTo(x+0.5,h - (buffer[i|0]/255) * h);
			x++;
		}
	}
	ctx.stroke();

	if(this.properties.mark >= 0)
	{
		var samplerate = LGAudio.getAudioContext().sampleRate;
		var binfreq = samplerate / buffer.length;
		var x = 2 * (this.properties.mark / binfreq) / delta;
		if(x >= this.size[0])
			x = this.size[0]-1;
		ctx.strokeStyle = "red";
		ctx.beginPath();
		ctx.moveTo(x,h);
		ctx.lineTo(x,0);
		ctx.stroke();
	}
}

LGAudioVisualization.title = "Visualization";
LGAudioVisualization.desc = "Audio Visualization";
LiteGraph.registerNodeType("audio/visualization", LGAudioVisualization);


function LGAudioBandSignal()
{
	//default 
	this.properties = {
		band: 440,
		amplitude: 1
	};

	this.addInput("freqs","array");
	this.addOutput("signal","number");
}

LGAudioBandSignal.prototype.onExecute = function()
{
	this._freqs = this.getInputData(0);
	if( !this._freqs )
		return;

	var band = this.properties.band;
	var v = this.getInputData(1);
	if(v !== undefined)
		band = v;

	var samplerate = LGAudio.getAudioContext().sampleRate;
	var binfreq = samplerate / this._freqs.length;
	var index = 2 * (band / binfreq);
	var v = 0;
	if( index < 0 )
		v = this._freqs[ 0 ];
	if( index >= this._freqs.length )
		v = this._freqs[ this._freqs.length - 1];
	else
	{
		var pos = index|0;
		var v0 = this._freqs[ pos ];
		var v1 = this._freqs[ pos+1 ];
		var f = index - pos;
		v = v0 * (1-f) + v1 * f;
	}

	this.setOutputData( 0, (v/255) * this.properties.amplitude );
}

LGAudioBandSignal.prototype.onGetInputs = function()
{
	return [["band","number"]];
}

LGAudioBandSignal.title = "Signal";
LGAudioBandSignal.desc = "extract the signal of some frequency";
LiteGraph.registerNodeType("audio/signal", LGAudioBandSignal);



function LGAudioDestination()
{
	this.audionode = LGAudio.getAudioContext().destination;
	this.addInput("in","audio");
}


LGAudioDestination.title = "Destination";
LGAudioDestination.desc = "Audio output";
LiteGraph.registerNodeType("audio/destination", LGAudioDestination);




})( window );
