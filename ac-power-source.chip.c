#include "wokwi-api.h"
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#define CHANNEL_COUNT 6
#define PI 3.14159265358979323846f
#define SQRT2 1.41421356237f

typedef struct {
  pin_t pin_vout;
  pin_t pin_iout[CHANNEL_COUNT];
  pin_t pin_load_enable;
  uint32_t attr_voltage_rms;
  uint32_t attr_frequency;
  uint32_t attr_voltage_sensor_rms_at_220;
  uint32_t attr_current_scale;
  uint32_t attr_current[CHANNEL_COUNT];
  timer_t timer;
} chip_state_t;

static float clampf(float value, float low, float high) {
  if (value < low) {
    return low;
  }
  if (value > high) {
    return high;
  }
  return value;
}

static float clamp_adc_voltage(float value) {
  return clampf(value, 0.02f, 4.98f);
}

static void update_outputs(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;

  const float voltage_rms = attr_read_float(chip->attr_voltage_rms);
  const float frequency = attr_read_float(chip->attr_frequency);
  const float voltage_sensor_rms_at_220 = attr_read_float(chip->attr_voltage_sensor_rms_at_220);
  const float current_scale = attr_read_float(chip->attr_current_scale);
  const float load_enabled = pin_read(chip->pin_load_enable) ? 1.0f : 0.0f;
  const float t = (float)get_sim_nanos() / 1000000000.0f;
  const float theta = 2.0f * PI * frequency * t;
  const float bias = 2.5f;

  const float voltage_sensor_rms = (voltage_rms / 220.0f) * voltage_sensor_rms_at_220;
  const float vout = bias + (voltage_sensor_rms * SQRT2 * sinf(theta));
  pin_dac_write(chip->pin_vout, clamp_adc_voltage(vout));

  for (uint8_t i = 0; i < CHANNEL_COUNT; i++) {
    const float current_rms = attr_read_float(chip->attr_current[i]) * load_enabled;
    const float current_sensor_rms = current_rms * current_scale;
    const float iout = bias + (current_sensor_rms * SQRT2 * sinf(theta));
    pin_dac_write(chip->pin_iout[i], clamp_adc_voltage(iout));
  }
}

void chip_init(void) {
  chip_state_t *chip = (chip_state_t *)calloc(1, sizeof(chip_state_t));

  chip->pin_vout = pin_init("VOUT", ANALOG);
  chip->pin_iout[0] = pin_init("IOUT0", ANALOG);
  chip->pin_iout[1] = pin_init("IOUT1", ANALOG);
  chip->pin_iout[2] = pin_init("IOUT2", ANALOG);
  chip->pin_iout[3] = pin_init("IOUT3", ANALOG);
  chip->pin_iout[4] = pin_init("IOUT4", ANALOG);
  chip->pin_iout[5] = pin_init("IOUT5", ANALOG);
  chip->pin_load_enable = pin_init("LOAD_ENABLE", INPUT_PULLDOWN);

  chip->attr_voltage_rms = attr_init_float("voltageRms", 220.0f);
  chip->attr_frequency = attr_init_float("frequency", 50.0f);
  chip->attr_voltage_sensor_rms_at_220 = attr_init_float("voltageSensorRmsAt220", 0.80f);
  chip->attr_current_scale = attr_init_float("currentSensorRmsVoltsPerAmp", 0.08f);

  chip->attr_current[0] = attr_init_float("currentCh0", 0.70f);
  chip->attr_current[1] = attr_init_float("currentCh1", 1.20f);
  chip->attr_current[2] = attr_init_float("currentCh2", 0.35f);
  chip->attr_current[3] = attr_init_float("currentCh3", 2.40f);
  chip->attr_current[4] = attr_init_float("currentCh4", 0.90f);
  chip->attr_current[5] = attr_init_float("currentCh5", 1.80f);

  const timer_config_t timer_config = {
    .callback = update_outputs,
    .user_data = chip,
  };
  chip->timer = timer_init(&timer_config);
  timer_start(chip->timer, 250, true);

  update_outputs(chip);
}
