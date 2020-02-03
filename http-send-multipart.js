// require in libs
var mustache = require('mustache'),
    request = require('request'),
    fs = require('fs');

var filepath = "default.csv"; // initializing filepath

module.exports = function(RED) {

    function httpSendMultipart(n) {
        // Setup node
        RED.nodes.createNode(this, n);
        var node = this;
        var nodeUrl = n.url;

        var isTemplatedUrl = (nodeUrl || "").indexOf("{{") != -1;

        this.ret = n.ret || "txt"; // default return type is text
        if (RED.settings.httpRequestTimeout) {
            this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 60000;
        } else {
            this.reqTimeout = 60000;
        }

        // 1) Process inputs to Node
        this.on("input", function(msg) {

            // Object extend
            function extend(target) {
                var sources = [].slice.call(arguments, 1);
                sources.forEach(function(source) {
                    for (var prop in source) {
                        target[prop] = source[prop];
                    }
                });
                return target;
            }

            // TODO: add ability to select other input types (not just files)

            // Look for filepath - // TODO improve logic

            if (!n.filepath && !msg.filepath) {
                // throw an error if no filepath
                node.warn(RED._("Error: no filepath found to send file."));
                msg.error = "Filepath was not defined";
                msg.statusCode = 400;
                node.send(msg); // TODO: make sure this escapes entirely; need better error-handling here
            } else {
                if (n.filepath) {
                    filepath = n.filepath;
                } else if (msg.filepath) { // TODO: improve logic
                    filepath = msg.filepath;
                }

                node.status({
                    fill: "blue",
                    shape: "dot",
                    text: "Sending multipart request..."
                });
                var url = nodeUrl; // TODO add ability to take this from the settings.js config file
                if (isTemplatedUrl) {
                    url = mustache.render(nodeUrl, msg);
                }
                if (!url) {
                    node.error(RED._("httpSendMultipart.errors.no-url"), msg);
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: (RED._("httpSendMultipart.errors.no-url"))
                    });
                    return;
                }

                // Add auth if it exists
                if (this.credentials && this.credentials.user) {
                    var urlTail = url.substring(url.indexOf('://') + 3); // hacky but it works. don't judge me
                    var username = this.credentials.user,
                        password = this.credentials.password;
                    if (url.indexOf("https") >= 0) {
                        url = 'https://' + username + ':' + password + '@' + urlTail;
                    } else {
                        url = 'http://' + username + ':' + password + '@' + urlTail;
                    }

                }

                var respBody, respStatus;

                var headers = {
                    'Content-Type': 'multipart/form-data'
                };
                if (msg.headers) {
                    var headers = extend({}, headers, msg.headers);
                }
                msg['request-headers'] = headers;

                var options = {
                    method: 'POST',
                    url: url,
                    headers: headers,
                    formData: {
                        file: {
                            value: fs.createReadStream(filepath),
                            options: {
                                filename: filepath,
                                contentType: null
                            }
                        },
                        minorEdit: 'true'
                    }
                };

                var thisReq = request(options, function(err, resp, body) {
                    // remove sending status
                    node.status({});

                    //Handle error
                    if (err || !resp) {
                        // node.error(RED._("httpSendMultipart.errors.no-url"), msg);
                        var statusText = "Unexpected error";
                        if (err) {
                            statusText = err;
                        } else if (!resp) {
                            statusText = "No response object";
                        }
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: statusText
                        });
                    } else {
                        msg.payload = body;
                        msg.statusCode = resp.statusCode || resp.status;
                        msg['http-send-multipart-headers'] = resp.headers;
                        msg['http-send-multipart-options'] = options;
    
                        if (node.ret !== "bin") {
                            msg.payload = body.toString('utf8'); // txt
    
                            if (node.ret === "obj") {
                                try {
                                    msg.payload = JSON.parse(body);
                                } catch (e) {
                                    node.warn(RED._("httpSendMultipart.errors.json-error"));
                                }
                            }
                        }
    
                        node.send(msg);
                    }
                });

            }

        }); // end of on.input

    } // end of httpSendMultipart fxn

    // Register the Node
    RED.nodes.registerType("http-send-multipart", httpSendMultipart, {
        credentials: {
            user: {
                type: "text"
            },
            password: {
                type: "password"
            }
        }
    });

};