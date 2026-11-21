package app.simplelift.wear.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.util.UUID

/** Watch token stays in encrypted preferences. A plain file is only used if the keystore fails. */
class TokenStore(context: Context) {
    private val prefs: SharedPreferences = open(context)

    fun token(): String? = prefs.getString(TOKEN, null)?.takeIf { it.isNotBlank() }

    fun saveToken(token: String) {
        prefs.edit().putString(TOKEN, token).apply()
    }

    fun clearToken() {
        prefs.edit().remove(TOKEN).apply()
    }

    fun deviceId(): String {
        val saved = prefs.getString(DEVICE, null)
        if (!saved.isNullOrBlank()) return saved
        val id = "wear-" + UUID.randomUUID().toString()
        prefs.edit().putString(DEVICE, id).apply()
        return id
    }

    fun autoOn(): Boolean = prefs.getBoolean(AUTO, false)

    fun autoAt(): Long = prefs.getLong(AUTO_AT, 0L)

    fun setAuto(on: Boolean, at: Long) {
        prefs.edit().putBoolean(AUTO, on).putLong(AUTO_AT, at).apply()
    }

    fun pending(): String? = prefs.getString(PENDING, null)

    fun setPending(code: String?) {
        prefs.edit().putString(PENDING, code).apply()
    }

    private fun open(context: Context): SharedPreferences {
        return try {
            val master = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                FILE,
                master,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            context.getSharedPreferences(FILE + "_plain", Context.MODE_PRIVATE)
        }
    }

    companion object {
        private const val FILE = "simplelift_wear"
        private const val TOKEN = "token"
        private const val DEVICE = "device"
        private const val AUTO = "auto"
        private const val AUTO_AT = "autoAt"
        private const val PENDING = "pending"
    }
}
