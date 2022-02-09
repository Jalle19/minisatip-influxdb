import axios from 'axios'
import { InfluxDB } from 'influx'

const requiredEnvVars = [
    'MINISATIP_HOSTS',
    'INFLUX_HOST',
    'INFLUX_DATABASE',
    'INFLUX_USERNAME',
    'INFLUX_PASSWORD',
]

function createDataPoint(host, state, bandwidth) {
    return {
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

        dataPoints.push(createDataPoint(host, state.data, bandwidth.data))
    }

    await influx.writePoints(dataPoints)
})()