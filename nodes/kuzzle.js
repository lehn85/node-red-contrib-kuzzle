module.exports = function (RED) {
    'use strict';
    const Kuzzle = require('kuzzle-sdk');
 

    function KuzzleNode(config){
        RED.nodes.createNode(this, config);
        this.hostname = config.hostname;
        this.port = config.port;
        this.kuzzle = new Kuzzle(this.hostname,{port:this.port, autoQueue:true, autoReplay:true});

        if (this.credentials && this.credentials.user && this.credentials.password) {
            this.kuzzle.login("local", {username: "username", password: "password"}, expiresIn, function (err, res) {
                //todo manage errors
            });
        }

    }
    RED.nodes.registerType('kuzzle', KuzzleNode, {
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });

    function KuzzleSubscribeNode(config){
        RED.nodes.createNode(this, config);  
        this.index = config.index;
        this.collectionName = config.collection;
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(this.collectionName,this.index);
        this.subscriptionRoom = null;

        let node = this;
        node.status({fill:"blue",shape:"dot",text:"waiting for filter"});


        let closeExistingSubscription = function() {
            if (node.subscriptionRoom) {
                node.subscriptionRoom.unsubscribe();
                node.status({fill:"blue",shape:"dot",text:"waiting for filter"});
            }
        }

        this.on("input", msg => {
            //close subscription if any
            closeExistingSubscription();

            //subscribe based on msf payload as a filter
            node.collection.subscribe(msg.payload,msg.options?msg.options:{},(err,result)=>{
                let resultMsg = {};
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
            });
        });

        this.on("close", () => {
            closeExistingSubscription();
        })




    }

    RED.nodes.registerType('kuzzle subscribe', KuzzleSubscribeNode);

    function KuzzlePublishNode(config){
        RED.nodes.createNode(this, config);  
        this.index = config.index;
        this.collectionName = config.collection;
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(this.collectionName,this.index);

        let node = this;

        this.on("input", msg => {
            //subscribe based on msf payload as a filter
            node.collection.publishMessage(msg.payload,msg.options?msg.options:{},(err,result)=>{
                //node.send({payload:result});
                if (err) { node.error("Kuzzle publish message error",err)};
            });
        });

        this.on("close", () => {
            
        })
    }

    RED.nodes.registerType('kuzzle publish message', KuzzlePublishNode);

    /**
     * 
     * @param {*} config 
     */
    function KuzzleCollectionNode(config) {
        let node= this;
        RED.nodes.createNode(this, config);  
        this.index = config.index;
        this.collectionName = config.collection;
        this.kuzzleNode = RED.nodes.getNode(config.kuzzle);
        this.collection = this.kuzzleNode.kuzzle.collection(this.collectionName,this.index);
        this.options = {};
        this.extraParams = {};
        this.extraParams.autoloop = config.autoloop;
        
        switch(config.operation) {
            case 'search':  
                this.function = doKuzzleSearch;
                this.options.from = parseInt(config.from) || 0;
                this.options.size = parseInt(config.size) || 10;
            break;
            case 'count':
                this.function = doKuzzleCount;                
            break;
            case 'save':
                this.function = doCreateDocument;
                this.options.ifExist = (config.ifExist=="replace")?"replace":false; 
                this.options.refresh = (config.refresh=="wait_for")?"replace":null;
            break;
        }

        this.on("input", msg => {
            //subscribe based on msf payload as a filter
            let options = Object.assign({},this.options,msg.options||{});
            let extraParams = Object.assign({},this.extraParams);
            extraParams.id = msg.id?msg.id:null;
            this.function(node,msg.payload,options,extraParams);
        });
    }

    /**
     * runs a search query on Kuzzle
     * @param node node
     * @param Object ES Filter
     * @param Object options
     * @param Object extraParams
     */
    function doKuzzleSearch(node, filter, options, extraParams) {
        node.collection.search(filter, options, function getMoreUntilDone(err,result) {
            if (err) { node.error("Kuzzle collection error",err); return; }; 
            if (result === null) { return; }

            node.send({
                aggregations: result.aggregations,
                collection: result.collection,
                fetched: result.fetched,
                options: result.options,
                filters: result.filters,
                total: result.total,
                payload: result.documents});

            //fetch next document if autoloop activated
            if (extraParams.autoloop) result.fetchNext(getMoreUntilDone);
        });
    }

    /**
     * runs a search query on Kuzzle
     * @param node node
     * @param Object ES Filter
     * @param Object options
     */
    function doKuzzleCount(node, filter, options) {
        node.collection.count(filter, options, (err,result) => {
            if (err) { node.error("Kuzzle collection error",err); return; }; 
            node.send({ payload: result});
        });
    }



    /**
     * create document using createDocument or mCreateDocument from SDK
     * @param node node
     * @param Object Array document
     * @param Object options
     * @param Object extraParams
     */
    function doCreateDocument(node, document, options, extraParams) {
        if (Array.isArray(document)) {
            //mCreate
        } else {
            //Create
            node.collection.createDocument(extraParams.id,document,options,(err,result)=>{
                if (err) { node.error("Kuzzle create document error",err)};
                node.send({payload:result});
            });
        }
    }


    RED.nodes.registerType('kuzzle collection', KuzzleCollectionNode);    


};