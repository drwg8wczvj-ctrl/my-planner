import React from "react";

export default function StatePulseTransition({ active }) {
  if (!active) return null;
  return (
    <div className="spt-wrap" aria-hidden="true">
      <div className="spt-ring spt-ring-outer" />
      <div className="spt-ring spt-ring-inner" />
      <div className="spt-core" />
    </div>
  );
}
