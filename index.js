const http = require("http");
const crypto = require("crypto");

const server = http.createServer((req, res) => {
    console.log('trying request', req.url);
    res.writeHead(200, {'Content-Type': 'text/plain'}) // plain text Writing on Head of incoming request. 
    res.end('okay'); // Ending the request
});

server.on('upgrade', function (req, socket) {
    if (req.headers.upgrade !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request')
        return 
    }

    const acceptKey = req.headers['sec-websocket-key'] 
    const hash = generateAcceptValue(acceptKey)


    const responseHeader = [
        'HTTP/1.1 101 Web Socket Protocol Handshake',
        'Upgrade: WebSocket',
        'Connection: Upgrade',
        `Sec-Websocket-Accept: ${hash}`
    ]

    socket.write(responseHeader.join('\r\n') + '\r\n\r\n')

    socket.on('data', (buffer) => {
        const message = parseMesaage(buffer);

        if (message) {
            console.log(message);
            socket.write(constructReply({ message: 'Hello form the server!' }))
        }
        else if (message === null) {
            console.log('Websocket connection close by the client!!');
            socket.errored();
        }
    })


    function constructReply (data) {
        const json = JSON.stringify(data); 
        const jsonByteLength = Buffer.byteLength(json);

        const lengthByteCount = jsonByteLength < 126 ? 0: 2
        const payloadLength = lengthByteCount === 0 ? jsonByteLength : 126
        const buffer = Buffer.alloc(2 + lengthByteCount + jsonByteLength)

        buffer.writeUInt8(0b10000001, 0)
        buffer.writeUInt8(payloadLength, 1)

        let payloadOffset = 2;
        if (lengthByteCount > 0) {
            buffer.writeUInt16BE(jsonByteLength, 2)
            payloadOffset += lengthByteCount
        }

        buffer.write(json, payloadOffset)
        return buffer
    }

    function parseMesaage (buffer) {
        const firstByte = buffer.readUInt8(0);

        const opCode = firstByte & 0xf
    // We can return null to signify that this is a connection termination frame
    if (opCode === 0x8) return null
    // We only care about text frames from this point onward
    if (opCode !== 0x1) return
    const secondByte = buffer.readUInt8(1)
    const isMasked = Boolean((secondByte >>> 7) & 0x1)
    // Keep track of our current position as we advance through the buffer
    let currentOffset = 2
    let payloadLength = secondByte & 0x7f
    if (payloadLength > 125) {
      if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(currentOffset)
        currentOffset += 2
      } else {
        throw new Error('Large payloads not currently implemented')
      }
    }
}

let maskingKey
if (isMasked) {
  maskingKey = buffer.readUInt32BE(currentOffset)
  currentOffset += 4
}

// Allocate somewhere to store the final message data
const data = Buffer.alloc(payloadLength)
// Only unmask the data if the masking bit was set to 1
if (isMasked) {
  // Loop through the source buffer one byte at a time, keeping track of which
  // byte in the masking key to use in the next XOR calculation
  for (let i = 0, j = 0; i < payloadLength; ++i, j = i % 4) {
    // Extract the correct byte mask from the masking key
    const shift = j === 3 ? 0 : (3 - j) << 3
    const mask =
                (shift === 0 ? maskingKey : maskingKey >>> shift) & 0xff
    // Read a byte from the source buffer
    const source = buffer.readUInt8(currentOffset++)
    // XOR the source byte and write the result to the data
    data.writeUInt8(mask ^ source, i)
  }
} else {
  // Not masked - we can just read the data as-is
  buffer.copy(data, 0, currentOffset++)
}

return data.toString('utf8')
});

function generateAcceptValue (acceptKey) {
    return crypto
      .createHash('sha1')
      .update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
      .digest('base64')
  }

server.listen(8080, () => {
    console.log('Server is running on port 3000')});
