import { qaName } from '../run-id'

// A work-report location to create, in this framework's terms. The
// `work-report-location` area's client maps it to the /web/work-report-locations payload.
// Defaults to a point in central Tel Aviv with a 100 m radius.
export interface NewWorkReportLocation {
  name: string
  lat: number
  lng: number
  radiusMeters: number
}

export class WorkReportLocationBuilder {
  private location: NewWorkReportLocation

  constructor(runId: string, label: string) {
    this.location = { name: qaName(runId, label), lat: 32.0853, lng: 34.7818, radiusMeters: 100 }
  }

  at(lat: number, lng: number): this {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error(`Not a coordinate: ${lat}, ${lng}`)
    }
    this.location = { ...this.location, lat, lng }
    return this
  }

  withRadius(radiusMeters: number): this {
    this.location = { ...this.location, radiusMeters }
    return this
  }

  build(): NewWorkReportLocation {
    return { ...this.location }
  }
}
