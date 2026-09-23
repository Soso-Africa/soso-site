declare module "pngjs" {
  export class PNG {
    constructor(options?: { width?: number; height?: number; filterType?: number; colorType?: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG, options?: { colorType?: number }): Buffer;
    };
  }
}