const url = require('url');
const http = require('http');
const Throttle = require('throttle');
const net = require("net");
fs = require('fs');

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
  var throttle = new Throttle(throttleRate);
  createConnection = (opts, callback) => {
    const socket = new net.Socket(opts);
    socket.connect(opts);
    callback(null, socket);
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
  console.log("Return Hash: " + h);
  return h;
}
let getHex = (byteArray) => { // validated: []byte{24, 108, 90, 204, 81, 189, 102, 126} returns 186c5acc51bd667e as per spec
  //console.log("byteArray: " + byteArray);
  let hex = Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
  console.log("hex: " + hex);
  return hex;
}
//For example, hashing the data: data := []byte{12}
//Should result in a hash of: []byte{24, 108, 90, 204, 81, 189, 102, 126}

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
          if (e) console.log(`Writing to outfile failed: ${e.message}`); process.exit(1);
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

/*
const agent = new http.Agent();
agent.createConnection({ path:"http://localhost", port: "8080" }, (err, stream) => {
  console.log("stream: " + stream);
});
*/

/*
http.get(url, (request, resp) => {
  let data = '';

  if (throttleRate){ 
    console.log(`Throttle set to (BPS): ${throttleRate}`)
    var throttle = new Throttle(1);
    http.pipe(throttle);
  }

  resp.on('data', (chunk) => {
    console.log("chunk: " + chunk);
    data += chunk;
  });
  resp.on('end', () => {
    console.log(data);
  });

}).on("error", (err) => {
  console.log("Error: " + err.message);
});
*/
/*
for (let x = 0; x < process.argv.length; x++){
  console.log(x + " : " + process.argv[x]);
}
*/


  /*
  for (let ib = 0; ib < bytes.length; ib++){ //for each incoming byte, ib:
    for (let hi = 0; hi < coefficients.length; hi++){  //for each byte of the hash, h
      let foo = null;
      if (i-1 < 0){  // in the case where i-1 == -1, h[i-1] should be 0.
        foo = 0
      } else {
        foo = hash[i-1];
      }
      hash[i] = ((foo + bytes[i]) * coefficients[i]) % 255;        //h[i] = ((h[i-1] + ib) * coefficient[i]) % 255  
    }
  }
  */