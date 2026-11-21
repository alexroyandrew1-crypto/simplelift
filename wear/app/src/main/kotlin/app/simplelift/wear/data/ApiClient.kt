package app.simplelift.wear.data

import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** HTTPS client for the same Worker routes the Garmin watch already calls. */
class ApiClient(private val base: String = API) {
    private val io = Executors.newSingleThreadExecutor()
    fun requestCode(deviceId: String, model: String): HttpResult {
        val body = """{"deviceId":${json(deviceId)},"model":${json(model)},"name":"Galaxy Watch"}"""
        return call("POST", "/pair/request", body, null)
    }

    fun poll(code: String, deviceId: String): HttpResult {
        val body = """{"code":${json(code)},"deviceId":${json(deviceId)}}"""
        return call("POST", "/pair/status", body, null)
    }

    fun plans(token: String): HttpResult = call("GET", "/watch/plans", null, token)

    fun workout(token: String): HttpResult = call("GET", "/watch/workout", null, token)

    fun pullLive(token: String): HttpResult = call("GET", "/watch/live", null, token)

    fun pushLive(token: String, snap: String): HttpResult = call("POST", "/watch/live", """{"snap":$snap}""", token)

    fun postResult(token: String, code: String): HttpResult = call("POST", "/watch/result", """{"code":${json(code)}}""", token)

    private fun call(method: String, path: String, body: String?, token: String?): HttpResult {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return io.submit<HttpResult> { open(method, path, body, token) }.get(20, TimeUnit.SECONDS)
        }
        return open(method, path, body, token)
    }

    private fun open(method: String, path: String, body: String?, token: String?): HttpResult {
        val conn = (URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection)
        return try {
            conn.requestMethod = method
            conn.connectTimeout = 10000
            conn.readTimeout = 15000
            conn.setRequestProperty("Accept", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            HttpResult(code, text)
        } finally {
            conn.disconnect()
        }
    }

    private fun json(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "") + "\""

    companion object {
        const val API = "https://simplelift-api.alexroyandrew1.workers.dev"
    }
}

data class HttpResult(val code: Int, val body: String)
