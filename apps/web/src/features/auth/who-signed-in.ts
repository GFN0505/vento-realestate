/**
 * After a passkey sign-in in the Session expired dialog: the same person (carry on with the page),
 * someone else (a shared computer: the page isn't theirs), or unknown (`me` didn't load: keep the
 * dialog and say the connection failed, never guess).
 */
export async function whoSignedIn(
  beforeId: string | undefined,
  fetchMe: () => Promise<{ user: { id: string } }>,
): Promise<'same' | 'other' | 'unknown'> {
  try {
    const me = await fetchMe()
    return me.user.id === beforeId ? 'same' : 'other'
  } catch {
    return 'unknown'
  }
}
