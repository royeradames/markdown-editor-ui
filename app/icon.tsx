import { ImageResponse } from "next/og";
export const size = { width: 96, height: 96 };
export const contentType = "image/png";
export default function Icon() { return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d1f22", color: "#ffffff", fontSize: 58, fontWeight: 700 }}>M</div>, size); }
