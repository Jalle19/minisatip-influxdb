import axios from 'axios'
import { InfluxDB } from 'influx'

const requiredEnvVars = [
    'MINISATIP_HOSTS',
    'INFLUX_HOST',
    'INFLUX_DATABASE',
    'INFLUX_USERNAME',
    'INFLUX_PASSWORD',
]

const createAdapterStates = (state) => {
    // Determine index of last available adapter
    let idx = 0

    for (let i = 0; i < state['ad_type'].length; i++) {
        if (state['ad_type'][i] !== 0) {
            idx = i
        } else {
            break
        }
    }

    // "Pivot" the state for each adapter
    const adapterStates = []

    for (let i = 0; i <= idx; i++) {
        adapterStates.push({
            'ad_idx': i,
            'ad_enabled': state['ad_enabled'][i],
            'ad_disabled': state['ad_disabled'][i],
            'ad_type': state['ad_type'][i],
            'ad_pos': state['ad_pos'][i],
            'ad_strength': state['ad_strength'][i],
            'ad_snr': state['ad_snr'][i],
            'ad_ber': state['ad_ber'][i],
            'ad_pol': state['ad_pol'][i],
            'ad_sr': state['ad_sr'][i],
            'ad_bw': state['ad_bw'][i],
            'ad_stream': state['ad_stream'][i],
            'ad_fe': state['ad_fe'][i],
            'ad_master': state['ad_master'][i],
            'ad_sidcount': state['ad_sidcount'][i],
            'ad_phyad': state['ad_phyad'][i],
            'ad_sys': state['ad_sys'][i],
            'ad_mtype': state['ad_mtype'][i],
            'ad_allsys': state['ad_allsys'][i],
            'ad_pids': state['ad_pids'][i],
            'ad_ccerr': state['ad_ccerr'][i],
            'ad_decerr': state['ad_decerr'][i],
        })
    }

    return adapterStates
}

const createAdapterName = (adapterState) => {
    /*
    #define ADAPTER_DVB 1
    #define ADAPTER_SATIP 2
    #define ADAPTER_NETCV 3
    #define ADAPTER_CI 4
     */
    const adapterTypeMap = {
        1: 'DVB',
        2: 'SAT>IP',
        3: 'Netceiver',
        4: 'CI',
    }

    return `${adapterTypeMap[adapterState['ad_type']]} ${adapterState['ad_idx']}`
}

const createDataPoints = (host, state, bandwidth) => {
    const dataPoints = []

    const adapterStates = createAdapterStates(state)

    for (const adapterState of adapterStates) {
        const ad_active = adapterState['ad_pids'] !== 'none' && adapterState['ad_pids'] !== ''
        const ad_disabled = adapterState['ad_disabled'] === 1

        // Skip if adapter is disabled
        if (ad_disabled) {
            continue
        }

        const stateDataPoint = {
            'measurement': 'state',
            'fields': {
                ...adapterState,
                'ad_pidcount': ad_active ? adapterState['ad_pids'].split(',').length : 0,
                'ad_active': ad_active,
            },
            'tags': {
                'host': host,
                'adapter': createAdapterName(adapterState),
            }
        }

        dataPoints.push(stateDataPoint)
    }

    const bandwidthDataPoint = {
        'measurement': 'bandwidth',
        'fields': {
            'bandwidthBps': bandwidth['bw'] * 1000 * 8, // Convert KB/s to bps
            'totalTrafficBytes': bandwidth['tbw'] * 1024 * 1024, // Convert MiB to bytes
            'reads': bandwidth['reads'],
            'writes': bandwidth['writes'],
            'nsPerRead': bandwidth['ns_read'],
            'tt': bandwidth['tt'],
        },
        'tags': {
            'host': host,
        }
    }

    dataPoints.push(bandwidthDataPoint)

    return dataPoints
}

(async () => {
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`${requiredEnvVars.join(', ')} must be specified`)
        }
    }

    const influx = new InfluxDB({
        host: process.env.INFLUX_HOST,
        database: process.env.INFLUX_DATABASE,
        username: process.env.INFLUX_USERNAME,
        password: process.env.INFLUX_PASSWORD,
    })

    const databaseNames = await influx.getDatabaseNames()

    if (!databaseNames.includes(process.env.INFLUX_DATABASE)) {
        throw new Error(`The specified database "${process.env.INFLUX_DATABASE}" does not exist`)
    }

    let dataPoints = []

    let hosts = process.env.MINISATIP_HOSTS.split(',')

    for (const host of hosts) {
        const state = await axios.get(`http://${host}:8080/state.json`)
        const bandwidth = await axios.get(`http://${host}:8080/bandwidth.json`)

        dataPoints = dataPoints.concat(createDataPoints(host, state.data, bandwidth.data))
    }

    await influx.writePoints(dataPoints)
})()
