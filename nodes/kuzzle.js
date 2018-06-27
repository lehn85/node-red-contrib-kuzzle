module.exports = function (RED) {
    'use strict';
    const Kuzzle = require('kuzzle-sdk');
 

    /**
     * Kuzzle node manages Kuzzle connexion
     * @param {*} config 
     */
    function KuzzleNode(config){
        RED.nodes.createNode(this, config);
        let node = this;
        this.hostname = config.hostname;
        this.port = config.port;
        this.kuzzle = new Kuzzle(this.hostname,{port:this.port, autoQueue:true, autoReplay:true},()=> {
            if (this.credentials && this.credentials.user && this.credentials.password) {
                this.kuzzle.login("local", {username: this.credentials.user, password: this.credentials.password}, function (err, res) {
                    if (err) { node.error("Kuzzle login " + err); return; }; 
                });
            }
        });


        //On close node
        this.on('close', done => {
            node.kuzzle.disconnect();
            done();
        })

        //Kuzzle Listeners
        this.kuzzle.addListener('connected', ()=> {
            node.emit('connected');
        });
        this.kuzzle.addListener('disconnected', ()=> {
            node.emit('connected');
        });
        this.kuzzle.addListener('reconnected', ()=> {
            node.emit('connected');
        });
    }
    RED.nodes.registerType('kuzzle', KuzzleNode, {
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });

    /**
     * Kuzzle Subscription Node
     * @param {*} config 
     */
    function KuzzleSubscribeNode(config){
        let node = this;
        RED.nodes.createNode(this, config);  
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(config.collection,config.index);
        this.subscriptionRoom = null;
        this.options = {
            subscribeToSelf: config.subscribeToSelf,
            scope: config.scope,
            users: config.users,
            state: config.state
        }


        node.status({fill:"blue",shape:"dot",text:"waiting for filter"});


        function closeExistingSubscription() {
            if (node.subscriptionRoom) {
                node.subscriptionRoom.unsubscribe();
                node.status({fill:"blue",shape:"dot",text:"waiting for filter"});
            }
        }

        this.on("input", msg => {
            //close subscription if any
            closeExistingSubscription();

            //If msg.unsubscribe then stop execution
            if (msg.unsubscribe) return;

            let options = Object.assign({},node.options,msg.options||{});

            //subscribe based on msf payload as a filter
            node.collection.subscribe(msg.payload,options,(err,result)=>{
                let resultMsg = Object.assign({},msg);
                resultMsg.controller = result.controller;
                resultMsg.volatile = result.volatile;
                resultMsg.roomId = result.roomId;

                if (result.type=="document") {
                    //Document notification                                    
                    resultMsg.index = result.index;
                    resultMsg.collection = result.collection;
                    resultMsg.scope = result.scope;
                    resultMsg.state = result.state;
                    resultMsg.payload = result.document;
                    node.send([resultMsg,null]);
                } else {
                    //User notification 
                    resultMsg.user = result.user;
                    resultMsg.timestamp = result.timestamp;
                    resultMsg.payload = result.result.count;
                    node.send([null,resultMsg]);
                }                
            }).onDone((err,room)=> {
                if (err) { 
                    node.status({fill:"red",shape:"dot",text:"error"});
                    node.error("Subscription failed",err); 
                }
                node.status({fill:"green",shape:"dot",text:"connected"});
                node.subscriptionRoom = room;

                //Send the first count of the subscripbtion room
                room.count(function(err,result)  { 
                    let resultMsg = Object.assign({},msg,{payload:result});
                    node.send([null,null,resultMsg]) })
                
            });
        });

        this.on("close", done => {
            closeExistingSubscription();
            done()
        })
    }

    RED.nodes.registerType('kuzzle subscribe', KuzzleSubscribeNode);

    /**
     * Kuzzle Publish Message Node
     * @param {*} config  
     */
    function KuzzlePublishNode(config){
        let node = this;
        RED.nodes.createNode(this, config);  
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(config.collection,config.index);

        this.on("input", msg => {
            //subscribe based on msf payload as a filter
            node.collection.publishMessage(msg.payload,msg.options?msg.options:{},(err,result)=>{
                if (err) { node.error("Kuzzle publish message error",err)};
            });
        });
    }

    RED.nodes.registerType('kuzzle publish message', KuzzlePublishNode);

    /**
     * Kuzzle Collection Methods Node
     * createDocument, fetchDocument, deleteDocument, updateDocument, replaceDocument, search, count
     * @param {*} config 
     */
    function KuzzleCollectionNode(config) {
        let node = this;
        RED.nodes.createNode(this, config);  
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(config.collection,config.index);
        this.options = {};
        this.scroll = config.scroll;

        // Prepare function specific options from node form config
        // may be merged with msg.options
        switch(config.operation) {
            case 'search':  
                this.options.from = parseInt(config.from) || 0;
                this.options.size = parseInt(config.size) || 10;
            break;
            case 'create':
                this.options.ifExist = (config.ifexist==="replace")?"replace":false; 
                this.options.refresh = (config.refresh==="wait_for")?"wait_for":null;
            break;
        }
        
        // Runs the query on message input
        this.on("input", msg => {
            //merge msg options with config ones
            let options = Object.assign({},node.options,msg.options||{});

            switch(config.operation) {
                case 'search':  
                    node.collection.search(msg.payload, options, function getMoreUntilDone(err,result) {
                        if (err) { node.error("Kuzzle search "+err, msg); return; }; 
                        if (result === null) { return; }
            
                        node.send(Object.assign({},msg,{
                            aggregations: result.aggregations,
                            collection: result.collection,
                            fetched: result.fetched,
                            options: result.options,
                            filters: result.filters,
                            total: result.total,
                            payload: result.documents}));
            
                        //fetch next document if scroll activated
                        if (node.scroll) result.fetchNext(getMoreUntilDone);
                    });
                break;
                case 'update':
                case 'replace':
                    if (!msg.id) { node.error("Missing mandatory msg.id input value"); return; }
                case 'create':
                    node.collection[config.operation+'Document'](msg.id?msg.id:null,msg.payload,options,(err,result)=>{
                        if (err) { node.error("Kuzzle "+config.operation+" document "+err, msg); return;};
                        node.send(Object.assign({},msg,{payload:result}));
                    });
                break;
                case 'fetch':
                case 'delete':
                    node.collection[config.operation+'Document'](msg.payload,options,(err,result)=>{
                        if (err) { node.error("Kuzzle "+config.operation+" document "+err); return;};
                        node.send(Object.assign({},msg,{payload:result}));
                    });
                break;
                case 'count':
                    node.collection[config.operation](msg.payload,options,(err,result)=>{
                        if (err) { node.error("Kuzzle "+config.operation+" "+err, msg); return;};
                        node.send(Object.assign({},msg,{payload:result}));
                    });
                break;
                default:
                    node.error("Unkown method "+config.operation);
            }
        });

    }
    RED.nodes.registerType('kuzzle collection', KuzzleCollectionNode);    
};