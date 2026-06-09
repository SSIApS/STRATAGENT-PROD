import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:9000'

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
})

export function setSession(sessionId: string) {
  api.defaults.headers.common['x-session-id'] = sessionId
}
