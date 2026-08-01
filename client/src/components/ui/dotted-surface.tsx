"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";

type DottedSurfaceProps = Omit<React.ComponentProps<"div">, "ref"> & {
  size?: number;
  opacity?: number;
  sizeAttenuation?: boolean;
  vertexColors?: boolean;
  lightOnly?: boolean;
};

export function DottedSurface({
  className,
  size = 8,
  opacity = 0.8,
  sizeAttenuation = true,
  vertexColors = true,
  lightOnly = false,
  ...props
}: DottedSurfaceProps) {
  const { resolvedTheme: theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || navigator.userAgent.includes("jsdom") || (lightOnly && theme !== "light")) return;

    const SEPARATION = 150;
    const AMOUNTX = 40;
    const AMOUNTY = 60;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 2000, 10000);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(scene.fog.color, 0);
    container.appendChild(renderer.domElement);

    const positions: number[] = [];
    const colors: number[] = [];
    const geometry = new THREE.BufferGeometry();
    const isDark = theme === "dark";

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(
          ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
          0,
          iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
        );
        if (isDark) {
          colors.push(0.78, 0.78, 0.78);
        } else {
          // GearGuard blue rather than neutral black gives the light canvas
          // visible depth without making it look dirty or overly technical.
          colors.push(0.24, 0.46, 0.54);
        }
      }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size,
      vertexColors,
      color: vertexColors ? undefined : isDark ? 0xc8c8c8 : 0x246a86,
      transparent: true,
      opacity,
      sizeAttenuation,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let count = 0;
    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const positionAttribute = geometry.attributes.position;
      const values = positionAttribute.array as Float32Array;
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          values[i * 3 + 1] = Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
          i += 1;
        }
      }
      positionAttribute.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.1;
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [theme, size, opacity, sizeAttenuation, vertexColors, lightOnly]);

  if (lightOnly && theme !== "light") return null;

  return <div ref={containerRef} className={cn("pointer-events-none fixed inset-0", className)} {...props} />;
}

export default DottedSurface;
