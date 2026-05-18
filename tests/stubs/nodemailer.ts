export default {
  createTransport() {
    return {
      async sendMail() {
        return { accepted: [], rejected: [] }
      },
    }
  },
}

