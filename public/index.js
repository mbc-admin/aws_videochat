//index.js
const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const roomName = window.location.pathname.split('/')[2]
const sessionToken = window.location.pathname.split('/')[3]

const users = [
  {id: 68, name: "Ramses"},
  {id: 69, name: "Salva"},
  {id: 49, name: "Casquete"},
  {id: 50, name: "Raquel"},
  {id: 70, name: "Raquel"},
  {id: 70, name: "Raquel"},
  {id: 70, name: "Raquel"},
  {id: 70, name: "Raquel"},
  {id: 70, name: "Raquel"},
]

const localUser = users[sessionToken];

const socket = io("https://growpsychat.innobing.net/mediasoup-testing")

socket.on('connection-success', ({ socketId }) => {
  console.log("connection-success",socketId)
  getLocalStream()
})

let device
let rtpCapabilities
let producerTransport
let consumerTransports = []
let audioProducer
let videoProducer
let consumer
let isProducer = false

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
}

let audioParams;
let videoParams = { params };
let consumingTransports = [];
let remotes = [];

const streamSuccess = (stream) => {
  console.log('SSSSSSSS', stream);
  localVideo.srcObject = stream;
  userName.innerHTML = localUser.name;

  audioParams = { track: stream.getAudioTracks()[0]};
  videoParams = { track: stream.getVideoTracks()[0]};

  joinRoom()
}

const joinRoom = () => {
  console.log("localUser:", localUser)
  let user = localUser;
  socket.emit('joinRoom', { roomName, user }, (data) => {
    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
    // we assign to local variable and will be used when
    // loading the client Device (see createDevice above)
    rtpCapabilities = data.rtpCapabilities

    // once we have rtpCapabilities from the Router, create Device
    createDevice()
  })
}

const getLocalStream = () => {
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: {
      width: {
        min: 640,
        max: 640,
      },
      height: {
        min: 400,
        max: 400,
      }
    }
  })
  .then(streamSuccess)
  .catch(error => {
    navigator.mediaDevices.getUserMedia({
      audio: true
    })
    .then(streamSuccess)
    .catch(error => {
      navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            min: 640,
            max: 640,
          },
          height: {
            min: 400,
            max: 400,
          }
        }
      })
      .then(streamSuccess)
      .catch(error => {
        console.log('jajajajjaja', error.message)
      })
      console.log('jajajajjaja', error.message)
    })
    console.log('jajajajjaja', error.message)
  })
}

// A device is an endpoint connecting to a Router on the
// server side to send/recive media
const createDevice = async () => {
  try {
    device = new mediasoupClient.Device()

    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    await device.load({
      // see getRtpCapabilities() below
      routerRtpCapabilities: rtpCapabilities
    })

    console.log('Device RTP Capabilities', device.rtpCapabilities)

    // once the device loads, create transport
    createSendTransport()

  } catch (error) {
    console.log(error)
    if (error.name === 'UnsupportedError')
      console.warn('browser not supported')
  }
}

const createSendTransport = () => {
  // see server's socket.on('createWebRtcTransport', sender?, ...)
  // this is a call from Producer, so sender = true
  socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
    // The server sends back params needed
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }

    console.log( params)

    // creates a new WebRTC Transport to send media
    // based on the server's producer transport params
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
    producerTransport = device.createSendTransport(params)

    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
    // this event is raised when a first call to transport.produce() is made
    // see connectSendTransport() below
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-connect', ...)
        await socket.emit('transport-connect', {
          dtlsParameters,
        })

        // Tell the transport that parameters were transmitted.
        callback()

      } catch (error) {
        errback(error)
      }
    })

    producerTransport.on('produce', async (parameters, callback, errback) => {
      console.log(parameters)

      try {
        // tell the server to create a Producer
        // with the following parameters and produce
        // and expect back a server side producer id
        // see server's socket.on('transport-produce', ...)
        await socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData,
        }, ({ id, producersExist }) => {
          // Tell the transport that parameters were transmitted and provide it with the
          // server side producer's id.
          callback({ id })

          // if producers exist, then join room
          if (producersExist) getProducers()
        })
      } catch (error) {
        errback(error)
      }
    })

    connectSendTransport()
  })
}

const connectSendTransport = async () => {
  // we now call produce() to instruct the producer transport
  // to send media to the Router
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  // this action will trigger the 'connect' and 'produce' events above

  audioProducer = await producerTransport.produce(audioParams);
  videoProducer = await producerTransport.produce(videoParams);

  audioProducer.on('trackended', () => {
    console.log('audio track ended')

    // close audio track
  })

  audioProducer.on('transportclose', () => {
    console.log('audio transport ended')

    // close audio track
  })

  videoProducer.on('trackended', () => {
    console.log('video track ended')

    // close video track
  })

  videoProducer.on('transportclose', () => {
    console.log('video transport ended')

    // close video track
  })
}

const signalNewConsumerTransport = async (remoteProducerId, user) => {
  console.log("user in new consumer: ", user)
  //check if we are already consuming the remoteProducerId
  if (consumingTransports.includes(remoteProducerId)) return;
  console.log("Adding remote producer id to cosuming transports");
  console.log( remoteProducerId);
  consumingTransports.push(remoteProducerId);
  console.log(consumingTransports);

  await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
    // The server sends back params needed
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }
    console.log("emit createWebRtcTransport")
    console.log(`PARAMS... ${params}`)

    let consumerTransport
    try {
      consumerTransport = device.createRecvTransport(params)
      console.log("set consumer transport: ", consumerTransport)
    } catch (error) {
      // exceptions:
      // {InvalidStateError} if not loaded
      // {TypeError} if wrong arguments.
      console.log(error)
      return
    }

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        await socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: params.id,
        })

        console.log("consumer transport connect event");

        // Tell the transport that parameters were transmitted.
        callback()
      } catch (error) {
        // Tell the transport that something was wrong
        errback(error)
      }
    })

    connectRecvTransport(consumerTransport, remoteProducerId, params.id, user)
  })
}

// server informs the client of a new producer just joined
socket.on('new-producer', ({ producerId, user }) => signalNewConsumerTransport(producerId, user))

const getProducers = () => {
  socket.emit('getProducers', producerIds => {
    console.log("get producers ids: ",producerIds)
    // for each of the producer create a consumer
    // producerIds.forEach(id => signalNewConsumerTransport(id))
    producerIds.forEach((producer) => signalNewConsumerTransport(producer.producerId, producer.user))
  })
}

const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId, user) => {
  console.log("user connectRecvTransport: ", user)
  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  await socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
    remoteProducerId,
    serverConsumerTransportId,
  }, async ({ params }) => {
    if (params.error) {
      console.log('Cannot Consume')
      return
    }

    console.log(`Consumer Params ${params}`)
    // then consume with the local consumer transport
    // which creates a consumer
    const consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    })

    console.log("consumer: ", consumer)

    consumerTransports = [
      ...consumerTransports,
      {
        consumerTransport,
        serverConsumerTransportId: params.id,
        producerId: remoteProducerId,
        consumer,
      },
    ]

    console.log("consumer transports: ", consumerTransports)

    // create a new div element for the new consumer media
    let newElem = document.createElement('div')
    // newElem.setAttribute('id', `td-${remoteProducerId}`)

    remotes.push(remoteProducerId);

    console.log('PARAMS', videoParams);

    if (params.kind == 'audio') {
      console.log("audio from producer id: ", remoteProducerId)
      //append to the audio container
      newElem.setAttribute('id', `remoteVideo${remoteProducerId}`)
      newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
    } else {
      //append to the video container
      newElem.setAttribute('id', `remoteVideo${remoteProducerId}`)
      newElem.setAttribute('class', 'remoteVideo')
      newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay playsinline ></video><span class="peer-data" >'+user.name+'</span>'
    }

    videoContainer.appendChild(newElem)

    remotes.map(remote => {
      if (remotes.length <= 8) {
        document.getElementById(remote).setAttribute('class', "video"+remotes.length)
      } else {
        document.getElementById(remote).setAttribute('class', "videoMultiple")
      }
    })

    // destructure and retrieve the video track from the producer
    const { track } = consumer

    console.log("track: ", track)
    console.log("HTML remoteProducerId: ", remoteProducerId)

    document.getElementById(remoteProducerId).srcObject = new MediaStream([track])

    // the server consumer started with media paused
    // so we need to inform the server to resume
    socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
  })
}


socket.on('producer-closed', ({ remoteProducerId }) => {
  console.log("producer closed: ", remoteProducerId)
  // server notification is received when a producer is closed
  // we need to close the client-side consumer and associated transport
  const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
  producerToClose.consumerTransport.close()
  producerToClose.consumer.close()

  // remove the consumer transport from the list
  consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)
  remotes = remotes.filter(remote => remote !== remoteProducerId);
  console.log('REMMMM', localVideo);
  // remove the video div element
  /*let elementRemove = document.getElementById(`remoteVideo${remoteProducerId}`);
  videoContainer.removeChild(elementRemove);*/
  document.getElementById(`remoteVideo${remoteProducerId}`).style.display = "none";
  remotes.map(remote => {
    if (remotes.length <= 8) {
      document.getElementById(remote).setAttribute('class', "video"+remotes.length)
    } else {
      document.getElementById(remote).setAttribute('class', "videoMultiple")
    }
  })
})

document.addEventListener("DOMContentLoaded", cancelMicro);
document.addEventListener("DOMContentLoaded", hangoutCall);
document.addEventListener("DOMContentLoaded", cancelVideo);

function cancelVideo() {
  document.getElementById('containerVid').addEventListener('click', () => {
    if (videoParams.track.enabled) {
      document.getElementById('videoIcon').src = 'assets/videoOff.svg';
      videoParams.track.enabled = false;
      let videoNone = document.createElement('div');
      videoNone.setAttribute('style', 'top: 0; position: absolute; display: flex; flex-direction: row; justify-content: center; align-items: center; width: 100%; height: 100%;');
      let textVideoNone = document.createElement('p');
      textVideoNone.textContent = 'SIN SEÑAL';
      textVideoNone.setAttribute('style', 'color: #FFFFFF');
      videoNone.appendChild(textVideoNone);
      document.getElementById('local').appendChild(videoNone);
    } else {
      document.getElementById('videoIcon').src = 'assets/videoON.svg';
      videoParams.track.enabled = true;
    }
    console.log('click video', videoParams);
  })
}

function hangoutCall() {
  document.getElementById('containerCallOff').addEventListener('click', () => {
    socket.disconnect();
    self.close();
    history.back();
    /*remotes = [];
    let childs = document.getElementById('videoContainer').child;
    childs.map(child => {
      document.getElementById('videoContainer').removeChild(child)
    })*/
    console.log('disconnect', )
  })
}

function cancelMicro() {
  document.getElementById('containerMicro').addEventListener('click', () => {
    if (audioParams.track.enabled) {
      document.getElementById('microIcon').src = 'assets/micOff.svg';
      audioParams.track.enabled = false;
    } else {
      document.getElementById('microIcon').src = 'assets/micOn.svg';
      audioParams.track.enabled = true;
    }
    console.log('click', audioParams)
  })
}

