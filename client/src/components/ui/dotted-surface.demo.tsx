import DottedSurface from "@/components/ui/dotted-surface";

const settings = {
  size: 8,
  opacity: 0.8,
  sizeAttenuation: true,
  vertexColors: true,
};

export default function Demo(props: Partial<typeof settings>) {
  const s = { ...settings, ...props };
  return (
    <div className="h-screen w-screen">
      <DottedSurface {...s} />
    </div>
  );
}
