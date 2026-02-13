import React from "react";
import { TopMenuBar } from "../components/TopMenuBar";
import Dropdown from "../components/Dropdown";

export function Header({
  show3D,
  setShow3D,
}: {
  show3D: boolean;
  setShow3D: (v: boolean) => void;
}) {
  return (
    <header className="appHeader">
      <TopMenuBar show3D={show3D} setShow3D={setShow3D} />
    </header>
  );
}
