# Official Node Red contribution for Kuzzle

## About Kuzzle

A backend software, self-hostable and ready to use to power modern apps.

You can access the Kuzzle repository on [Github](https://github.com/kuzzleio/kuzzle)

* [About this contribution](#about-this-node-red-contribution)
* [Installation](#installation)
* [Usage](#usage)
* [License](#license)

## About this node red contribution

This contribution bings Node-RED nodes for Kuzzle methods including createDocument, publishMessage, search, count, subscribe, updateDocument and replaceDocument

## Installation

```
cd ~\.node-red
npm install node-red-contrib-kuzzle
```

See the [Node-RED Documentation](http://nodered.org/docs/getting-started/adding-nodes) for more options.

## Usage

Once installed, you will have 3 additional nodes :

* Kuzzle Input: for subscribe method
* Kuzzle Ouput: for publishMessage method
* Kuzzle Storage: for data manipulation
    * create document
    * update document
    * delete document
    * replace document
    * search
    * count

This contribution makes use of [Kuzzle Javascript SDK](https://github.com/kuzzleio/sdk-javascript) and establishes a Websocket connection to Kuzzle.

See [Kuzzle SDK documentation](https://docs.kuzzle.io/sdk-reference/collection) for methods details and options

## License

[Apache 2](LICENSE.md)