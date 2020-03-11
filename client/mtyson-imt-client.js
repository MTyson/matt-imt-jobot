const url = require('url');
const http = require('http');
const Throttle = require('throttle');
const net = require("net");
fs = require('fs');

var inherits = require('util').inherits;
var Transform = require('stream').Transform;

if (process.argv.length < 4){
    console.log("missing required args: <URL> <OUT-FILE> [throttle]");
    process.exit(1);
}

const argUrl = process.argv[2];
const outfile = process.argv[3];
let throttleRate = process.argv[4];

var urlObject = null;
try {
  urlObject = new URL(argUrl.trim());
} catch (e) { console.log(e.message + " | " + argUrl); process.exit(1); }

console.log(`Retrieving: ${urlObject} | Output file: ${outfile}`);

const agent = new http.Agent();

let createConnection = agent.createConnection;
if (throttleRate){ 
  if (isNaN(throttleRate)){ console.log("Throttle rate has to be a number. Got: " + throttleRate); process.exit(1);}
  throttleRate = parseInt(throttleRate, 10);
  console.log(`Throttle set to (BPS): ${throttleRate}`)
  var throttle = new Throttle(100 * 1024);
  createConnection = (opts, callback) => {
    const socket = new net.Socket(opts);
    let startTime = Date.now();

    console.log("highwater: " + socket.readableHighWaterMark); // 16k default

    socket.on("data", (chunk) => {
      
      console.log("bytesread: " + socket.bytesRead);
      console.log("socket chunk: " + chunk.byteLength);

      let totalSeconds = (Date.now() - startTime) / 1000;
      let expected = totalSeconds * throttleRate;
      console.log("expected: " + expected);

      if (socket.bytesRead > expected) {
        // Use this byte count to calculate how many seconds ahead we are. Taken from: https://github.com/TooTallNate/node-throttle/blob/master/throttle.js
        const remainder = socket.bytesRead - expected;
        const sleepTime = remainder / throttleRate * 1000;

        if (sleepTime > 0) {
          console.log("PAUSING for " + sleepTime);
          socket.pause();
          setTimeout(() => {
            //socket.resume();
          }, sleepTime);
        } 
      }
    })
    socket.pause();
    socket.connect(opts);
    socket.resume();
    return socket; //.pipe(throttle);
  }
}

let hash = (buffer) => { // validated: hash([12]) returns {24, 108, 90, 204, 81, 189, 102, 126} as per spec
  let coefficients = [2, 3, 5, 7, 11, 13, 17, 19];
  let h = [0,0,0,0,0,0,0,0];
  for (let ib of buffer){ //for each incoming byte, ib:
    for (let i = 0; i < h.length; i++){  //for each byte of the hash, h
      let foo = null;
      if (i-1 == -1){  // in the case where i-1 == -1, h[i-1] should be 0.
        foo = 0;
      } else {
        foo = h[i-1];
      }
      //console.log(`((${foo} + ${ib}) * ${coefficients[i]}) % 255`);
      h[i] = (((foo + ib) * coefficients[i]) % 255);        //h[i] = ((h[i-1] + ib) * coefficient[i]) % 255 
    }
  }
  console.log("END hash(): " + h);
  return h;
}
let getHex = (byteArray) => { // validated: []byte{24, 108, 90, 204, 81, 189, 102, 126} returns 186c5acc51bd667e as per spec
  //console.log("byteArray: " + byteArray);
  let hex = Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
  console.log("END getHex(): " + hex);
  return hex;
}
//For example, hashing the data: data := []byte{12}
//Should result in a hash of: []byte{24, 108, 90, 204, 81, 189, 102, 126}

//https://nodejs.org/es/docs/guides/backpressuring-in-streams/
const req = http.request({ 
  createConnection: createConnection,  hostname: urlObject.hostname,
  path: urlObject.path,  port: urlObject.port,  method: 'GET' }, 
  (resp) => {  
    let data = [];
    resp.on('data', function(chunk) {
      console.log("http CHUNK: " + chunk.byteLength );
      data.push(chunk);
      //resp.pause();
      //to = setTimeout( () => { resp.resume() }, 1000 );
    }).on('end', function() {
        //at this point data is an array of Buffers so Buffer.concat() can make us a new Buffer of all of them together
        var buffer = Buffer.concat(data);
        // for (let x of buffer){ console.log("x: " + x); }
        //console.log("hex: " + getHex(hash([12])));

        fs.writeFile(outfile, getHex( hash( buffer ) ), (e) => {
          if (e) { console.log(`Writing to outfile failed: ${e.message}`); process.exit(1); }
          console.log("Wrote hash hex to: " + outfile);
          process.exit(0);
        });      
    }).on('error', function(e){
      console.log("Error in response " + e.message);
     // clearTimeout(to);
    })
    //resp.on('data', (chunk) => { console.log("chunk: " + chunk + " /n");   data += chunk;  });
    resp.on('end', () => { /*console.log("final: " + data);*/ });
})

req.on('error', (e) => {
  console.error(`That request didn't work out: ${e.message}`);
});

req.end();

/*
const req = http.request({ 
  createConnection: createConnection,  hostname: urlObject.hostname,
  path: urlObject.path,  port: urlObject.port,  method: 'GET' }, 
  (resp) => {  
    let data = [];

    resp.on('data', function(chunk) {
        data.push(chunk);
    }).on('end', function() {
        //at this point data is an array of Buffers so Buffer.concat() can make us a new Buffer of all of them together
        var buffer = Buffer.concat(data);
        //console.log("hex: " + getHex(hash([12])));

        fs.writeFile(outfile, getHex( hash( buffer ) ), (e) => {
          if (e) { console.log(`Writing to outfile failed: ${e.message}`); process.exit(1); }
          console.log("Wrote hash hex to: " + outfile);
          process.exit(0);
        });      
    });
    //resp.on('data', (chunk) => { console.log("chunk: " + chunk + " /n");   data += chunk;  });
    resp.on('end', () => { console.log("final: " + data); });
})

req.on('error', (e) => {
  console.error(`That request didn't work out: ${e.message}`);
});

req.end();
*/
