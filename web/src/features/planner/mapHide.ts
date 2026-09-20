export type MapHideItem = {
  seq: number;
  mapHidden?: boolean;
  poi?: { lng: number; lat: number } | null;
};

/** 地图上要画的点：有坐标，且没被隐藏 */
export function mapVisible<T extends MapHideItem>(items: T[]): T[] {
  return items.filter(
    (i) => !i.mapHidden && i.poi && Number.isFinite(i.poi.lng) && Number.isFinite(i.poi.lat),
  );
}

/** 两个要画的点中间夹着隐藏点，就不能用已存路段的标签 */
export function spanSkipsHidden<T extends MapHideItem>(all: T[], aSeq: number, bSeq: number): boolean {
  return all.some((i) => i.mapHidden && i.seq > aSeq && i.seq < bSeq);
}
