# 0003 — Single-Smartphone v1 Topology, Keyed Butt-Cap Mount & 16g Impact Signature

In v1, Kinetra operates with a single smartphone paired directly via BLE to the GeoTrick IMU (operating in DTL or Face-On mode, while keeping schemas extensible to dual-camera in v2). The sensor snaps into a mechanically keyed butt-cap mount (`Keyed Butt-Cap Mount`) aligned with the clubface, and uses a $\pm 16\,g$ accelerometer whose saturation clipping at impact ($\ge 20\,g$ shockwave), combined with post-impact ring-down vibrations and axial gyroscope torsional impulse ($\Delta \omega_z$), detects ball contact and localizes face strike (`heel`, `center`, `toe`).

## Context & Trade-offs

1. **Why $\pm 16\,g$ works at the butt cap**: While a clubhead experiences $>80\,g$ of centripetal acceleration during the downswing, the butt cap ($s = 0$, at the hands' pivot radius $R \approx 0.6\text{ m}$ and hand speed $v \approx 8\text{ m/s}$) experiences only $10\text{–}14\,g$ before impact, remaining below the $16\,g$ saturation ceiling throughout the swing. At ball contact, the $>20\,g$ elastic shockwave traveling up the shaft intentionally saturates the accelerometer at $\pm 16\,g$.
2. **Strike location without >16g peak amplitude**: Because peak linear acceleration is clipped at $16\,g$, strike location on the clubface cannot rely on peak $g$ amplitude alone. Instead, `imu-engine` fuses:
   - **Axial gyroscope twist impulse ($\Delta \omega_z$)**: off-center strikes generate a gear-effect torque around the shaft axis (opening twist for a `toe` strike, closing/null twist for a `heel` strike) measured without saturation by the gyroscope.
   - **Clipping duration & post-impact ring-down energy ($5\text{–}15\,g$ window over $5\text{–}25\text{ ms}$)**: off-center strikes transfer less kinetic energy to the ball and leave significantly higher flexural ring-down vibration in the shaft than a `center` (sweet-spot) strike.
