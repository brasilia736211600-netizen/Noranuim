import { BaseService } from './base'

interface InstagramEdge {
  node: {
    ad: null | object
  }
}

interface InstagramTimeline {
  data: {
    xdt_api__v1__feed__timeline__connection: {
      edges: InstagramEdge[]
    }
  }
}

export class InstagramService extends BaseService {
  shouldIntercept(url: string) {
    const should = url.startsWith('https://www.instagram.com/graphql/query')
    console.log('[nora][instagram] shouldIntercept', { url, should })
    return should
  }

  transformResponse(res: string) {
    const data = JSON.parse(res) as InstagramTimeline
    const before = data.data.xdt_api__v1__feed__timeline__connection?.edges
    if (!before) {
      console.log('[nora][instagram] no timeline edges in response')
      return res
    }
    const after = before.filter((x) => !x.node.ad)
    console.log('[nora][instagram] filtered timeline edges', {
      before: before.length,
      after: after.length,
      removed: before.length - after.length,
    })
    data.data.xdt_api__v1__feed__timeline__connection.edges = after
    return JSON.stringify(data)
  }
}
