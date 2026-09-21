import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { brand } from "../../theme";

// Curva de marca ("S" acostada) que cierra los headers azules: corta hacia el
// fondo claro, cuña verde delgada encima y trazo amarillo → naranja sobre la
// curva. Se usa en el header de Inicio y en el de los módulos.
//
// viewBox fijo 400 x 110 con preserveAspectRatio="none": se estira al ancho y
// alto reales. width/height numéricos (no "%"): en Android con "%" dentro de
// un contenedor flex el Svg queda en tamaño 0.
const VB_H = 110;
// Barriga amplia a la izquierda y subida suave hasta el borde derecho.
const BASE = "M0,54 C80,114 190,108 250,66 C300,32 350,14 400,10";
const CUT = `${BASE} L400,${VB_H} L0,${VB_H} Z`;
const GREEN = `${BASE} L400,0 C350,4 300,22 250,56 C190,98 80,104 0,54 Z`;

export function BrandCurve({ width, height, style }: { width: number; height: number; style?: object }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 400 ${VB_H}`} preserveAspectRatio="none" style={style}>
      <Defs>
        <LinearGradient id="brandRibbon" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={brand.yellow} />
          <Stop offset="0.45" stopColor={brand.orange} />
          <Stop offset="1" stopColor={brand.orange} />
        </LinearGradient>
      </Defs>
      <Path d={CUT} fill={brand.bg} />
      <Path d={GREEN} fill={brand.green} />
      <Path d={BASE} stroke="url(#brandRibbon)" strokeWidth={4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
