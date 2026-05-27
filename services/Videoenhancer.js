
// ─── Network profiles ────────────────────────────────────────────────────────
// Adaptive bitrate: rampup করবে monitorAndAdapt() থেকে
export const ENHANCE_CONFIG = {
  // Start LOW — packet loss থাকলে এখানেই থাকবে
  startBitrateKbps:  250,
  // Cap (good network এ এই পর্যন্ত যেতে পারে)
  maxBitrateKbps:    900,
  // Floor (slow network এও এর নিচে যাবে না)
  minBitrateKbps:    120,

  targetFramerate:   24,
  minFramerate:      12,

  // Camera resolution — small = fast encode, less drop
  idealWidth:        640,
  idealHeight:       480,
  minWidth:          320,
  minHeight:         240,
}

// ─── SDP Bitrate Booster ──────────────────────────────────────────────────────
// b=AS line video section এ inject — start bitrate দিয়ে
export const boostSdpBitrate = (sdp, bitrateKbps = ENHANCE_CONFIG.startBitrateKbps) => {
  if (!sdp) return sdp

  const lines = sdp.split('\n')
  const result = []
  let inVideoSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('m=video')) {
      inVideoSection = true
      result.push(lines[i])
      continue
    }

    if (line.startsWith('m=audio') || line.startsWith('m=application')) {
      inVideoSection = false
    }

    // Video section এ c= line এর পরে b=AS inject
    if (inVideoSection && line.startsWith('c=')) {
      result.push(lines[i])
      if (!lines[i + 1]?.trim().startsWith('b=')) {
        result.push(`b=AS:${bitrateKbps}`)
        result.push(`b=TIAS:${bitrateKbps * 1000}`)
      }
      continue
    }

    if (inVideoSection && line.startsWith('b=')) {
      result.push(`b=AS:${bitrateKbps}`)
      result.push(`b=TIAS:${bitrateKbps * 1000}`)
      continue
    }

    result.push(lines[i])
  }

  return result.join('\n')
}

// ─── RTCRtpSender Encoding (initial low quality) ─────────────────────────────
export const boostVideoEncoding = async (peerConnection, bitrateKbps = ENHANCE_CONFIG.startBitrateKbps) => {
  if (!peerConnection) return
  try {
    const senders = peerConnection.getSenders ? peerConnection.getSenders() : []
    for (const sender of senders) {
      if (!sender.track || sender.track.kind !== 'video') continue
      if (typeof sender.getParameters !== 'function') continue

      const params = sender.getParameters()
      if (!params) continue
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]

      params.encodings = params.encodings.map((enc) => ({
        ...enc,
        maxBitrate:            bitrateKbps * 1000,
        maxFramerate:          ENHANCE_CONFIG.targetFramerate,
        scaleResolutionDownBy: 1.0,
        networkPriority:       'high',
        priority:              'high',
        // Adaptive: encoder নিজে frame drop করতে পারবে
        adaptivePtime:         true,
      }))

      if (typeof sender.setParameters === 'function') {
        await sender.setParameters(params)
        console.log(`[VideoEnhancer] Init encoding → ${bitrateKbps}kbps @ ${ENHANCE_CONFIG.targetFramerate}fps`)
      }
    }
  } catch (err) {
    console.warn('[VideoEnhancer] init encoding skipped:', err.message)
  }
}

// ─── Adaptive bitrate (runs every 3s during call) ────────────────────────────
// Network condition দেখে video bitrate কে up/down করে — call drop হবে না।
let adaptInterval = null
let prevPacketsLost = 0
let prevPacketsTotal = 0
let currentBitrate = ENHANCE_CONFIG.startBitrateKbps

export const startAdaptiveBitrate = (peerConnection) => {
  if (!peerConnection || adaptInterval) return
  currentBitrate = ENHANCE_CONFIG.startBitrateKbps
  prevPacketsLost = 0
  prevPacketsTotal = 0

  adaptInterval = setInterval(async () => {
    try {
      if (!peerConnection.getStats) return
      const stats = await peerConnection.getStats()
      let lost = 0, total = 0, rtt = 0

      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          total = report.packetsSent || 0
        }
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
          lost = report.packetsLost || 0
          rtt  = report.roundTripTime || 0
        }
      })

      const deltaLost  = Math.max(0, lost  - prevPacketsLost)
      const deltaTotal = Math.max(1, total - prevPacketsTotal)
      const lossRatio  = deltaLost / deltaTotal
      prevPacketsLost  = lost
      prevPacketsTotal = total

      // Decision:
      //   >5% loss OR rtt>0.5s   → step DOWN aggressively
      //   <1% loss AND rtt<0.3s  → step UP slowly
      let newBitrate = currentBitrate
      if (lossRatio > 0.05 || rtt > 0.5) {
        newBitrate = Math.max(ENHANCE_CONFIG.minBitrateKbps, Math.floor(currentBitrate * 0.7))
      } else if (lossRatio < 0.01 && rtt < 0.3 && rtt > 0) {
        newBitrate = Math.min(ENHANCE_CONFIG.maxBitrateKbps, Math.floor(currentBitrate * 1.15))
      }

      if (newBitrate !== currentBitrate) {
        currentBitrate = newBitrate
        await boostVideoEncoding(peerConnection, newBitrate)
        console.log(`[Adaptive] loss=${(lossRatio * 100).toFixed(1)}% rtt=${(rtt * 1000).toFixed(0)}ms → ${newBitrate}kbps`)
      }
    } catch (_) {}
  }, 3000)
}

export const stopAdaptiveBitrate = () => {
  if (adaptInterval) {
    clearInterval(adaptInterval)
    adaptInterval = null
  }
}

// ─── Enhanced Camera Constraints (LOW for fast encode) ───────────────────────
export const getEnhancedVideoConstraints = (config = ENHANCE_CONFIG) => ({
  width:     { min: config.minWidth,  ideal: config.idealWidth,  max: 1280 },
  height:    { min: config.minHeight, ideal: config.idealHeight, max: 720 },
  frameRate: { min: config.minFramerate, ideal: config.targetFramerate, max: 30 },
  facingMode: 'user',
})

export const getFallbackVideoConstraints = () => ({
  width:     { ideal: 320 },
  height:    { ideal: 240 },
  frameRate: { ideal: 15 },
  facingMode: 'user',
})

// ─── Audio SDP Optimizer ──────────────────────────────────────────────────────
// Opus: FEC ON (packet loss recovery), DTX ON (silence এ no packet),
// maxaveragebitrate 24kbps voice এর জন্য — slow network এ smooth
export const optimizeAudioSdp = (sdp) => {
  if (!sdp) return sdp
  const lines  = sdp.split('\n')
  const result = []
  let opusPayload = null
  for (const line of lines) {
    const match = line.match(/a=rtpmap:(\d+) opus\/48000/)
    if (match) { opusPayload = match[1]; break }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (opusPayload && line.startsWith(`a=fmtp:${opusPayload}`)) {
      result.push(
        `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;` +
        `stereo=0;maxaveragebitrate=24000;cbr=0;sprop-maxcapturerate=16000`
      )
      continue
    }
    result.push(lines[i])
    if (opusPayload && line.startsWith(`a=rtpmap:${opusPayload} opus`)) {
      const nextLine = lines[i + 1]?.trim() || ''
      if (!nextLine.startsWith(`a=fmtp:${opusPayload}`)) {
        result.push(
          `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;` +
          `stereo=0;maxaveragebitrate=24000;cbr=0;sprop-maxcapturerate=16000`
        )
      }
    }
  }
  return result.join('\n')
}
