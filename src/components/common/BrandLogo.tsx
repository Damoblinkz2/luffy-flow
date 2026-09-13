import type { HTMLAttributes } from "react"

import flowmarkUrl from "../../../assets/luffyflow-flowmark.png"

export interface BrandLogoProps extends HTMLAttributes<HTMLSpanElement> {
  showName?: boolean
}

/** Reusable image mark keeps the extension's arrow-and-conveyor identity identical to the public site. */
export const BrandLogo = ({ showName = true, className = "", ...props }: BrandLogoProps) => (
  <span className={`inline-flex items-center gap-2 font-bold ${className}`} {...props}>
    <img className="h-9 w-9 shrink-0 rounded-[10px]" src={flowmarkUrl} alt="" />
    {showName ? <span>LuffyFlow</span> : null}
  </span>
)
