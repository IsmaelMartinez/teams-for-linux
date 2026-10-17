#!/usr/bin/env node
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const challenge = request.publicKey.challenge;
  if (challenge === 'BAUG') {
    setTimeout(() => {}, 10000);
    return;
  }
  if (challenge === 'BwgJ') {
    console.log(JSON.stringify({ type: 'qr',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/></svg>',
    }));
  }
  const client = {
    type: 'webauthn.get', origin: request.origin, challenge,
    crossOrigin: Boolean(request.topOrigin),
  };
  if (request.topOrigin) client.topOrigin = request.topOrigin;
  const result = { type: 'result', credential: {
    id: 'AQID', rawId: 'AQID', type: 'public-key',
    response: {
      clientDataJSON: Buffer.from(JSON.stringify(client)).toString('base64url'),
      authenticatorData: Buffer.alloc(37).toString('base64url'),
      signature: 'AQID', userHandle: null,
    },
  } };
  setTimeout(() => console.log(JSON.stringify(result)), challenge === 'BwgJ' ? 600 : 0);
});
