/**
 * @Author Matt Tyson matt@wholisticsoftware.com
 * @copyright Attribution
 * 
 * to run:
 *   npm start -- http://localhost:8080 ./outfile.txt 100000
 * test server at ../server
 * 
 * Satisfies the following requirements:
Write a command line utility that accepts
1) A URL
2) A destination path for a file containing a hash
3) An optional value for throttling the download

Given a url
        - fetch the file, and apply throttling to the download if requested
        - without writing the file to disk hash the data using the "IMT Hash" function (described below)
        - write the hash to the specified destination file in hexadecimal format

 

IMT Hash description:
Length: 8 bytes
coefficients := [8]int{ 2, 3, 5, 7, 11, 13, 17, 19 }
for each incoming byte, ib:
  for each byte of the hash, h
    h[i] = ((h[i-1] + ib) * coefficient[i]) % 255
    // in the case where i-1 == -1, h[i-1] should be 0.
For example, hashing the data:
data := []byte{12}

Should result in a hash of:
[]byte{24, 108, 90, 204, 81, 189, 102, 126}

When converted to hexadecimal for writing to the output file:
186c5acc51bd667e
 */
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
  //console.log("END hash(): " + h);
  return h;
}
let getHex = (byteArray) => { // validated: []byte{24, 108, 90, 204, 81, 189, 102, 126} returns 186c5acc51bd667e as per spec
  //console.log("byteArray: " + byteArray);
  let hex = Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
  //console.log("END getHex(): " + hex);
  return hex;
}
//For example, hashing the data: data := []byte{12}
//Should result in a hash of: []byte{24, 108, 90, 204, 81, 189, 102, 126}


// This is here to verify that throttling the HTTP response stream is effectively throttling the tcp stream via backpressure
// https://nodejs.org/es/docs/guides/backpressuring-in-streams/
const agent = new http.Agent();
let createConnection = agent.createConnection;
createConnection = (opts, callback) => {
  const socket = new net.Socket(opts);

  socket.on("data", (chunk) => {
    //console.log("tcp bytesread: " + socket.bytesRead);
  })
  socket.connect(opts);
  return socket;
}

const req = http.request({ 
  createConnection: createConnection,
  hostname: urlObject.hostname,
  path: urlObject.path,  port: urlObject.port,  method: 'GET' }, 
  (resp) => {  
    let data = [];
    let startTime = Date.now();
    let totalBytes = 0;

    if (throttleRate){
      if (isNaN(throttleRate)){ console.log("Throttle rate has to be a number. Got: " + throttleRate); process.exit(1);}
      throttleRate = parseInt(throttleRate, 10);
      console.log(`Throttle set to (BPS): ${throttleRate} (Low values can cause connection to appear to hang.)`);
    }

    resp.on('data', function(chunk) {
      //console.log("http chunk: " + chunk.byteLength );
      data.push(chunk); // add chunk to our buffer

      totalBytes += chunk.byteLength; // track how much total data we've received

      if (throttleRate){
        // check if we need to pause based on throttle rate
        let totalSeconds = (Date.now() - startTime) / 1000;
        let expected = totalSeconds * throttleRate;
        //console.log("expected: " + expected);
        if (totalBytes > expected) {
          // Use this byte count to calculate how many seconds ahead we are. Taken from: https://github.com/TooTallNate/node-throttle/blob/master/throttle.js
          const remainder = totalBytes - expected;
          const sleepTime = remainder / throttleRate * 1000; // calc sleeptime
  
          if (sleepTime > 0) {
            resp.pause(); 
            setTimeout(() => {
              resp.resume();
            }, sleepTime);
          } 
        }
      }
    }).on('end', function() {
        var buffer = Buffer.concat(data);  //at this point data is an array of Buffers so Buffer.concat() can make us a new Buffer of all of them together
        // for (let x of buffer){ console.log("x: " + x); } console.log("hex: " + getHex(hash([12])));
        fs.writeFile(outfile, getHex( hash( buffer ) ), (e) => {
          if (e) { console.log(`Writing to outfile failed: ${e.message}`); process.exit(1); }
          console.log("Wrote hash hex to: " + outfile);
          process.exit(0);
        });
        
        let elapsed = (Date.now() - startTime) / 1000;
        console.log("elapsed: " + elapsed);
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