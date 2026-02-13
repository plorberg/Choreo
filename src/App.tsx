import React, { useState } from "react";
import "./App.css";
import { AppStateProvider } from "./state/useAppState";
import { TransportProvider } from "./state/useTransport";
import { ChoreoProvider } from "./state/useChoreo";
import { Header } from "./layout/Header";
import { Workspace } from "./layout/Workspace";
import { Footer } from "./layout/Footer";

function AppInner() {
  const [show3D, setShow3D] = useState(true);

  return (
    <div className="appRoot">
      <Header show3D={show3D} setShow3D={setShow3D} />
      <div className="content">
        <Workspace show3D={show3D} />
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <TransportProvider>
        <ChoreoProvider>
          <AppInner />
        </ChoreoProvider>
      </TransportProvider>
    </AppStateProvider>
  );
}
