import { deleteSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'sf_session')
  if (token) {
    await deleteSession(token)
  }
  deleteCookie(event, 'sf_session')
  return { ok: true }
})
