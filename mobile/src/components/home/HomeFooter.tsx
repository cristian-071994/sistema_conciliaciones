import { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { brand } from "../../theme";

// Footer del inicio (solo UI): foto del camión + cintas de marca + base azul.
//
// Geometría: las cintas se dibujan en una "caja" inferior con proporción fija
// (BOX_W x BOX_H, la misma del concepto de diseño) anclada abajo. La foto se
// escala para cubrir exactamente esa caja, así camión y cintas quedan SIEMPRE
// en la misma posición relativa, en cualquier alto de pantalla. Si al footer
// le sobra alto, lo que queda arriba de la foto es fondo + degradado.
const PHOTO_RATIO = 1630 / 965;
const BOX_W = 606;
const BOX_H = 414;
const PHOTO_SCALE = 1.1;
const WHEELS_Y = 0.53;

// Coordenadas en el espacio BOX_W x BOX_H. Orden de pintado (atrás → adelante):
// 1) Velo azul translúcido bajo las cintas (deja ver la carretera).
const VEIL = "M606,200 C530,225 430,250 330,265 C220,285 100,340 0,372 L0,414 L606,414 Z";
// 2) Base azul sólida con "barriga": sube desde la esquina inferior izquierda
//    y se aplana hacia la derecha.
const BASE = "M0,372 C80,352 170,316 270,294 C370,278 480,279 606,276 L606,414 L0,414 Z";
// 3) Cinta verde: desde el borde derecho hasta pasado el centro, bajo la
//    naranja, termina en punta.
const GREEN = "M606,140 C500,190 360,248 205,300 C360,262 500,228 606,202 Z";
// 4) Cinta naranja continua: gruesa arriba a la derecha, se afina a una línea
//    al centro (bajo las ruedas del camión) y vuelve a engrosar como cuña en la
//    esquina inferior izquierda.
const ORANGE =
  "M606,104 C520,150 410,218 300,256 C200,292 100,320 0,336 " +
  "L0,372 C100,346 200,306 300,262 C410,226 520,184 606,150 Z";

export function HomeFooter() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }

  // Caja inferior con la proporción del concepto; la foto la cubre (más ancha
  // que la pantalla → se recortan los costados, centrada).
  const boxH = size ? size.width * (BOX_H / BOX_W) : 0;
  // La foto es algo más alta que la caja y se sube, para que las ruedas del
  // camión (≈73% del alto de la foto original) caigan en WHEELS_Y de la caja,
  // justo por encima de la línea naranja. Lo que queda debajo de la foto lo
  // cubren el velo y la base azul.
  const photoH = boxH * PHOTO_SCALE;
  const photoW = photoH * PHOTO_RATIO;
  const boxTop = size ? size.height - boxH : 0;
  const photoTop = boxTop + boxH * WHEELS_Y - photoH * 0.73;
  const fadeH = 70;

  return (
    <View style={styles.footer} onLayout={onLayout}>
      {size && (
        <>
          <View style={[styles.backing, { height: boxH * 0.3 }]} />
          <Image
            source={require("../../../assets/images/cointra_truck_footer.webp")}
            style={{ position: "absolute", top: photoTop, left: (size.width - photoW) / 2, width: photoW, height: photoH }}
            resizeMode="cover"
          />
          {/* Degradado: funde el cielo con el fondo. Si la foto sobresale por arriba del footer (pantallas bajas), va en el borde visible. */}
          <Svg width={size.width} height={fadeH} style={{ position: "absolute", left: 0, top: Math.max(photoTop, 0) }}>
            <Defs>
              <LinearGradient id="skyFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={brand.bg} stopOpacity={1} />
                <Stop offset="1" stopColor={brand.bg} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.width} height={fadeH} fill="url(#skyFade)" />
          </Svg>
          <Svg
            width={size.width}
            height={boxH}
            viewBox={`0 0 ${BOX_W} ${BOX_H}`}
            preserveAspectRatio="none"
            style={{ position: "absolute", left: 0, bottom: 0 }}
          >
            <Defs>
              <LinearGradient id="orangeRibbon" x1="0" y1="1" x2="1" y2="0">
                <Stop offset="0" stopColor={brand.orange} />
                <Stop offset="1" stopColor="#F7941D" />
              </LinearGradient>
            </Defs>
            <Path d={VEIL} fill={brand.navy} fillOpacity={0.4} />
            <Path d={BASE} fill={brand.navy} />
            <Path d={GREEN} fill={brand.green} />
            <Path d={ORANGE} fill="url(#orangeRibbon)" />
          </Svg>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backing: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: brand.navy },
  footer: {
    flex: 1,
    minHeight: 200,
    width: "100%",
    backgroundColor: brand.bg,
    overflow: "hidden",
  },
});
