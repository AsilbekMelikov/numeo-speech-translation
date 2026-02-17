
export const extractBase64 = (audioBase64: string) => {
    if (audioBase64.includes(';base64,')) {
        return audioBase64.split(';base64,')[1] ?? ''
    }
    return audioBase64
}
