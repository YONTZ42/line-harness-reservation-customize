import type { HttpClient } from '../http.js'
import type { ApiResponse, UploadedImage, UploadImageInput } from '../types.js'

export class ImagesResource {
  constructor(private readonly http: HttpClient) {}

  async upload(input: UploadImageInput): Promise<UploadedImage> {
    if (input.body) {
      const headers: Record<string, string> = {
        'Content-Type': input.mimeType ?? 'application/octet-stream',
      }
      if (input.filename) headers['X-Filename'] = encodeURIComponent(input.filename)
      const res = await this.http.post<ApiResponse<UploadedImage>>('/api/images', input.body, headers)
      return res.data
    }
    const res = await this.http.post<ApiResponse<UploadedImage>>('/api/images', input)
    return res.data
  }

  async delete(key: string): Promise<void> {
    await this.http.delete(`/api/images/${key}`)
  }
}
